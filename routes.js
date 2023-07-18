const express = require('express');
const router = express.Router();

// Other route definitions...

// Home route
router.get('/home', (req, res) => {
  res.render('home'); // Render the home page (home.ejs)
});

module.exports = router;
