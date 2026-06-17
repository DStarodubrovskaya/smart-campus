class TrustLogicEngine:
    def __init__(self, db_service):
        self.db = db_service 
        self.WEIGHT_THRESHOLD = 1.4
        self.SHADOWBAN_THRESHOLD = 0.2
        self.VIP_THRESHOLD = 0.9
        self.TRUST_REWARD = 0.02
        self.TRUST_PENALTY = -0.05

    def process_report(self, user_db_id, user_trust, user_tier, room_db_id, reported_status, current_room_status):
        # 1. Save the report to the database and get its ID 
        report_id = self.db.add_report_to_history(user_db_id, room_db_id, reported_status, user_trust)

        # 2. Shadowban
        if user_trust < self.SHADOWBAN_THRESHOLD:
            self.db.update_report_message(report_id, "Shadowbanned (ignored)")
            return {"new_status": current_room_status, "event_msg": "Shadowbanned (ignored)", "trust_updates": {}}

        # 3. VIP Override
        if user_trust >= self.VIP_THRESHOLD:
            self.db.clear_room_history(room_db_id)
            self.db.update_report_message(report_id, "VIP Override")
            return {"new_status": reported_status, "event_msg": "VIP Override", "trust_updates": {}}

        #4. Get the current story 
        history = self.db.get_pending_reports(room_db_id)

        # 5. Pioneer Rule
        if len(history) == 1 and user_trust >= 0.5 and user_tier != "Newbie":
            self.db.clear_room_history(room_db_id)
            app_uid = history[0]["app_user_id"] # Get the name of the discoverer 
            msg = f"Pioneer Rule | {app_uid} (+{self.TRUST_REWARD})"
            self.db.update_report_message(report_id, msg)
            return {
                "new_status": reported_status,
                "event_msg": msg,
                "trust_updates": {user_db_id: self.TRUST_REWARD}
            }

        # 6. Consensus Math
        weight_for_status = sum(r["trust"] for r in history if r["status"] == reported_status)

        if weight_for_status >= self.WEIGHT_THRESHOLD:
            trust_updates = {}
            updates_str_list = []
            
            for r in history:
                delta = self.TRUST_REWARD if r["status"] == reported_status else self.TRUST_PENALTY
                trust_updates[r["user_id"]] = delta
                sign = "+" if delta > 0 else ""
                updates_str_list.append(f"{r['app_user_id']} ({sign}{delta})")
            
            self.db.clear_room_history(room_db_id)
            
            updates_str = ", ".join(updates_str_list)
            msg = f"Consensus Reached | Updates: {updates_str}"
            self.db.update_report_message(report_id, msg)
            
            return {
                "new_status": reported_status,
                "event_msg": msg,
                "trust_updates": trust_updates
            }

        # 7. If there is no consensus yet 
        msg = f"Pending... ({weight_for_status:.2f}/{self.WEIGHT_THRESHOLD})"
        self.db.update_report_message(report_id, msg)
        return {
            "new_status": current_room_status,
            "event_msg": msg,
            "trust_updates": {}
        }