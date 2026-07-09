// client_secretを使うトークン交換だけはブラウザから直接呼べないためサーバー側で仲介する
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const code = req.body && req.body.code;
  if (!code) {
    res.status(400).json({ error: 'code is required' });
    return;
  }

  try {
    const params = new URLSearchParams({
      client_id: process.env.SLACK_CLIENT_ID || '',
      client_secret: process.env.SLACK_CLIENT_SECRET || '',
      code,
      redirect_uri: process.env.SLACK_REDIRECT_URI || '',
    });

    const slackRes = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const data = await slackRes.json();

    if (!data.ok) {
      res.status(400).json({ error: data.error || 'oauth_failed' });
      return;
    }

    // Botは使わずユーザートークン(authed_user.access_token)のみを利用する
    const userAccessToken = data.authed_user && data.authed_user.access_token;
    if (!userAccessToken) {
      res.status(400).json({ error: 'missing_user_token' });
      return;
    }

    res.status(200).json({
      accessToken: userAccessToken,
      team: data.team && data.team.name,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
};
