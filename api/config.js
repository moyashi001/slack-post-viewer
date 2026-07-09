// Bot Token Scopesは不要。ユーザートークンで search.messages を使うためUser Token Scopesのみ要求する
const USER_SCOPES = ['search:read', 'users:read', 'channels:read'].join(',');

// クライアントIDやredirect_uriはクライアント側で必要になる非機密情報のため配布する
module.exports = (req, res) => {
  res.status(200).json({
    clientId: process.env.SLACK_CLIENT_ID || '',
    redirectUri: process.env.SLACK_REDIRECT_URI || '',
    userScope: USER_SCOPES,
  });
};
