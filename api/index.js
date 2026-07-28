const { bootstrap } = require('../dist/serverless');

module.exports = async (req, res) => {
  const app = await bootstrap();
  const instance = app.getHttpAdapter().getInstance();
  instance(req, res);
};
