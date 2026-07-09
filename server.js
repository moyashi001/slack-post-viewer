require('dotenv').config();
const path = require('path');
const express = require('express');

const configHandler = require('./api/config');
const oauthTokenHandler = require('./api/oauth/token');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/config', configHandler);
app.post('/api/oauth/token', oauthTokenHandler);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Slack post viewer listening on http://localhost:${port}`);
});
