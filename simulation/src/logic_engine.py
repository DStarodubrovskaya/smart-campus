class TrustLogicEngine:
    """
    Core Consensus Algorithm & Reputation Engine.
    Evaluates crowdsourced reports in real-time, applying weighted mathematics 
    and role-based rules to determine the true state of a room.
    Decoupled from data access (DAL) to strictly handle business logic.
    """
    def __init__(self, db_service):
        self.db = db_service 

        # --- ALGORITHMIC THRESHOLDS ---
        # 1.4 requires ~3 average users (0.5 * 3 = 1.5) to reach consensus
        self.WEIGHT_THRESHOLD = 1.4
        # Users below this score are silently ignored (Troll protection)
        self.SHADOWBAN_THRESHOLD = 0.2
        # Lecturers or highly trusted users override the system instantly
        self.VIP_THRESHOLD = 0.9

        # --- GAMIFICATION MODIFIERS ---
        self.TRUST_REWARD = 0.02
        self.TRUST_PENALTY = -0.05

    def process_report(self, user_db_id, user_trust, user_tier, room_db_id, reported_status, current_room_status):
        """
        Processes a single state-change signal through the validation pipeline.
        Returns the calculated new room status and reputation deltas.
        """
        # 1. Audit Logging
        report_id = self.db.add_report_to_history(user_db_id, room_db_id, reported_status, user_trust)

        # 2. Shadowban Filter (Silent rejection)
        if user_trust < self.SHADOWBAN_THRESHOLD:
            self.db.update_report_message(report_id, "Shadowbanned (ignored)")
            return {"new_status": current_room_status, "event_msg": "Shadowbanned (ignored)", "trust_updates": {}}

        # 3. VIP Override (Authoritative state change)
        if user_trust >= self.VIP_THRESHOLD:
            self.db.clear_room_history(room_db_id)
            self.db.update_report_message(report_id, "VIP Override")
            return {"new_status": reported_status, "event_msg": "VIP Override", "trust_updates": {}}

        #4. State Retrieval (Fetch unresolved reports from the temporal window)
        history = self.db.get_pending_reports(room_db_id)

        # 5. Pioneer Rule (Heuristic for low-traffic areas)
        # Allows trusted, established users to flip a room without waiting for consensus.
        if len(history) == 1 and user_trust >= 0.5 and user_tier != "Newbie":
            self.db.clear_room_history(room_db_id)
            app_uid = history[0]["app_user_id"]
            msg = f"Pioneer Rule | {app_uid} (+{self.TRUST_REWARD})"
            self.db.update_report_message(report_id, msg)
            return {
                "new_status": reported_status,
                "event_msg": msg,
                "trust_updates": {user_db_id: self.TRUST_REWARD}
            }

        # 6. Consensus Mathematics (Weighted Voting)
        weight_for_status = sum(r["trust"] for r in history if r["status"] == reported_status)

        if weight_for_status >= self.WEIGHT_THRESHOLD:
            trust_updates = {}
            updates_str_list = []

            # Distribute Gamification Rewards and Penalties based on Ground Truth alignment
            for r in history:
                delta = self.TRUST_REWARD if r["status"] == reported_status else self.TRUST_PENALTY
                trust_updates[r["user_id"]] = delta
                sign = "+" if delta > 0 else ""
                updates_str_list.append(f"{r['app_user_id']} ({sign}{delta})")

            # Soft-delete the processed reports to reset the state machine for this room
            self.db.clear_room_history(room_db_id)
            
            updates_str = ", ".join(updates_str_list)
            msg = f"Consensus Reached | Updates: {updates_str}"
            self.db.update_report_message(report_id, msg)
            
            return {
                "new_status": reported_status,
                "event_msg": msg,
                "trust_updates": trust_updates
            }

        # 7. Pending State (Threshold not yet met)
        msg = f"Pending... ({weight_for_status:.2f}/{self.WEIGHT_THRESHOLD})"
        self.db.update_report_message(report_id, msg)
        
        return {
            "new_status": current_room_status,
            "event_msg": msg,
            "trust_updates": {}
        }