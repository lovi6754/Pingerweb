# My Pinger — MongoDB + Render

A server-side uptime/keep-alive monitor for your own or authorized projects.

## Features
- Modern responsive dashboard
- Add multiple URLs
- 5 / 10 / 15 / 30 / 60 minute intervals
- Server-side scheduler (browser can be closed)
- Online / Offline / Error
- HTTP code
- Response time
- Last ping
- Ping Now
- Pause / Resume
- MongoDB Atlas persistence
- `/health` endpoint

## Render deployment

### 1. MongoDB Atlas
Create a MongoDB Atlas cluster and a database user. Add your Render service's outbound access as allowed network access according to your Atlas setup.

Copy your connection string, for example:
`mongodb+srv://USERNAME:PASSWORD@CLUSTER.mongodb.net/my-pinger`

Do NOT put the real password in GitHub.

### 2. GitHub
Upload this project to a GitHub repository.

### 3. Render
Create a **Web Service** from the repository.

Build Command:
`npm install`

Start Command:
`npm start`

Use your paid Render instance.

### 4. Environment variable
In Render -> Environment add:

`MONGODB_URI=your_mongodb_connection_string`

Do not commit `.env` or your MongoDB password.

### 5. Deploy
After deployment open:
`https://YOUR-SERVICE.onrender.com`

### Scheduler
The server checks every minute. Each project has its own selected interval, so a project configured for 10 minutes is pinged approximately every 10 minutes.

The scheduler is server-side, not browser-side.

### Important security
This version is a personal dashboard. If exposed publicly, add authentication before sharing the URL. Otherwise strangers could add arbitrary URLs and consume your server's resources.

Only monitor URLs you own or are authorized to test.


## Access-key login

The dashboard now has a private access-key login.

For convenience, the three supplied keys are the default values:
- `YUVRAJBOT`
- `YUVRAJSHARMAJI`
- `LOVELYBOT`

For production, it is better to override them in Render instead of keeping them in source code:

`LOGIN_KEYS=key1,key2,key3`

Optional:
`SESSION_SECRET=generate-a-long-random-secret`

Sessions are stored in server memory and expire after 24 hours. Restarting the Render service logs users out.
