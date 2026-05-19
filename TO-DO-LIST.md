Here we will write to each other what are the next steps.
And we'll remove/archive this later.

## Done:
- PostgreSQL cloud database connected
- Database initialization code written
- Current CSV files uploaded
- Add a script to automatically clean up schedule files to CSV
- Update the simulation to work with a database instead of a CSV

## To Do:
- EVERYONE! Connect to a cloud database - 'string-connection' in our group
- Check how correctly the database is built and how the data was loaded 
- Consider the simulation logic (e.g the level of trust - add trolls and penalty logic)
- Unify file formats in the data pipeline
- Frontend / Mobile App Development
- Automate scraping

## Important:
- We currently store pending confirmation reports in-memory via a PostgreSQL database,
which is good in case of a server crash. However, this isn't the best solution. 
Connecting Redis is an option, but that adds another db and complicates the architecture.