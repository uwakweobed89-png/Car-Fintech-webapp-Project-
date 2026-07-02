const { app, initDB } = require('./app');

const PORT = process.env.PORT || 8080;

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Car$ync API running on port ${PORT}`);
  });
});
