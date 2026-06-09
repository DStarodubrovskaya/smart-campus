## Contract with Front

A. Authorization/Registration Endpoint (POST /api/users/login)
The frontend calls this method every time the application is opened (after the user logs in).

If the user doesn't exist in the database, the backend will create them with the correct starting tier.

If they exist, the backend will simply return the current status of their profile.

Request body (JSON from the frontend):

JSON
{
"app_user_id": "student_biu_12345",
"role": "Student"
}
Note: the role can only be "Student" or "Lecturer".

Backend response (JSON for frontend):

JSON
{
"status": "success",
"user": {
"app_user_id": "student_biu_12345",
"role": "Student",
"tier": "Newbie",
"trust_score": 0.50,
"successful_reports": 0,
"reports_needed_for_promotion": 5,
"pioneer_rule_unlocked": false
}
}
What will be returned: User profile. Note the pioneer_rule_unlocked (boolean) field. If it's false, the user is still a "Newbie," and we can display a banner in their profile: "Your first 5 reports are reviewed by the community."

B. Report submission endpoint (POST /api/reports/submit)
Request body (JSON from the frontend):
JSON
{
"app_user_id": "student_biu_12345",
"room_id": 134,
"reported_status": "FREE"
}

Note on Room Identification (room_id)
Please note that physical room numbers are not globally unique across the campus (e.g., there can be a Room "101" in both Building 504 and Building 604).

However, when submitting a report via POST /api/reports/submit, you do not need to include the building number. Our database assigns a globally unique integer (room_id) to every specific room-building combination. Simply pass the room_id you receive from the GET /api/rooms endpoint, and the backend will automatically resolve the correct building and room under the hood.
