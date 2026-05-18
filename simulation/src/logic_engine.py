class TrustLogicEngine:
    def __init__(self, db_service):
        self.db = db_service 
        self.WEIGHT_THRESHOLD = 2.0
        self.SHADOWBAN_THRESHOLD = 0.2
        self.VIP_THRESHOLD = 0.9
        self.TRUST_REWARD = 0.02
        self.TRUST_PENALTY = -0.05

    def process_report(self, user_db_id, user_trust, room_db_id, reported_status, current_room_status):
        # 1. Shadowban
        if user_trust < self.SHADOWBAN_THRESHOLD:
            return {"new_status": current_room_status, "event_msg": "Shadowbanned (ignored)", "trust_updates": {}}

        # 2. VIP Override
        if user_trust >= self.VIP_THRESHOLD:
            self.db.clear_room_history(room_db_id)
            return {"new_status": reported_status, "event_msg": "VIP Override", "trust_updates": {}}

        # 3. Saves a new report in the database instead of the dictionary
        self.db.add_report_to_history(user_db_id, room_db_id, reported_status, user_trust)

        # 4. Takes the entire history of reports for this room from the database
        history = self.db.get_pending_reports(room_db_id)

        # 5. Calculates the weight for the current status
        weight_for_status = sum(r["trust"] for r in history if r["status"] == reported_status)

        if weight_for_status >= self.WEIGHT_THRESHOLD:
            trust_updates = {}
            for r in history:
                delta = self.TRUST_REWARD if r["status"] == reported_status else self.TRUST_PENALTY
                trust_updates[r["user_id"]] = delta
            
            # Consensus reached, clearing history in the database
            self.db.clear_room_history(room_db_id)
            
            return {
                "new_status": reported_status,
                "event_msg": "Consensus Reached",
                "trust_updates": trust_updates
            }

        return {
            "new_status": current_room_status,
            "event_msg": f"Pending... ({weight_for_status:.2f}/{self.WEIGHT_THRESHOLD})",
            "trust_updates": {}
        }