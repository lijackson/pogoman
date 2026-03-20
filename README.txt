Run backend:
cd backend
node --env-file=.env index.js

Run frontend:
cd frontend
npx serve

Run backup:
cd backend
node --env-file=.env dbstuff/dumprecords.js
