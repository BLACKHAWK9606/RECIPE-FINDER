const express = require("express");
const { Pool } = require("pg");
const session = require("express-session");
const app = express();
const bodyParser = require("body-parser");
const port = 9191;
const path = require("path");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const secret = crypto.randomBytes(32).toString("hex");
const multer = require("multer");
const flash = require("connect-flash");

// Configure PostgreSQL connection pool:
const pool = new Pool
({
  user: "postgres",
  host: "localhost",
  port: 5432,
  password: "Jayjay_1",
  database: "workout_planner",
});

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => 
  {
    cb(null, "public/images"); // Set the destination folder for uploaded images
  },
  filename: (req, file, cb) => 
  {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + "." + file.mimetype.split("/")[1]);
  },
});
const upload = multer({ storage: storage });

app.use(session(
  {
    secret: secret,
    resave: false,
    saveUninitialized: true,
  }
  )
);
console.log("Generated secret key:", secret);

// Set the view engine and specify the views directory:
app.set("views", path.join(__dirname, "views"));

// Serve static files from the public directory:
app.use(express.static("public"));

app.use(bodyParser.urlencoded({ extended: true }));

//This line enables parsing of the request body sent as URL-encoded data.
app.use(express.urlencoded({ extended: true }));

//This line enables parsing of success and error flash messages
app.use(flash());

//sets global variables that can be used to refer to success or error flash messages globally across all routes
app.use((req, res, next) => {
  res.locals.successMessage = req.flash("success");
  res.locals.errorMessage = req.flash("error");
  next();
});

// Set the view engine to EJS
app.set("view engine", "ejs");

// Import the routes
const routes = require("./routes");

// Use the routes
app.use("/", routes);

// Set up middleware and static files
// Set up the route for the login page
app
  .route("/login")
  .get((req, res) => {
    const successMessage = req.flash("success");
    res.render("login", { successMessage }); // Render the login page (login.ejs) with the success message
  })

  // Handle login form submission
  .post((req, res) => {
    const { email, password } = req.body;

    // Check if the user exists in the database
    pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email],
      (err, result) => {
        //error retrieving data
        if (err) {
          console.error("Error executing the query:", err);
          res.render("login", {
            error: "An error occurred. Please try again later.",
          });
        }
        //successful retrieval
        else {
          const user = result.rows[0];

          // User does not exist, render the login page with an error message
          if (!user) {
            res.render("login", {
              error: "Invalid email or password. Please try again.",
            });
          }

          // User exists, compare the hashed password
          else {
            const passwordMatch = bcrypt.compareSync(
              password,
              user.hashed_password
            );

            // Passwords match, set user session or authentication token
            // Redirect the user to the authenticated section of your app
            // Passwords match, set user ID in the session, render console.log with userID
            if (passwordMatch) {
              req.session.user = user;
              req.session.userId = user.id;
              console.log("User ID stored in session:", req.session.userId);

              // Redirect the user to the index page with a success message
              req.flash("success", "You have successfully logged in.");
              res.redirect("/index");
            }

            // Passwords don't match, render the login page with an error message
            else {
              res.render("login", {
                error: "Invalid email or password. Please try again.",
              });
            }
          }
        }
      }
    );
  });

// Render the register page (register.ejs)
app
  .route("/register")
  .get((req, res) => {
    res.render("register");
  })
  .post((req, res) => {
    const {
      username,
      email,
      password,
      first_name,
      last_name,
      phone_number,
      country,
    } = req.body;

    // Check if the user already exists in the database
    pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email],
      (err, result) => {
        if (err) {
          console.error("Error executing the query:", err);
          res.render("register", {
            error: "An error occurred. Please try again later.",
          });
        } else {
          const user = result.rows[0];
          if (user) {
            // User already exists, render the registration page with an error message
            res.render("register", {
              error:
                "Email already registered. Please choose a different email.",
            });
          } else {
            // User does not exist, proceed with account creation
            const hashedPassword = bcrypt.hashSync(password, 10);

            // Insert the new user into the database with hashed password
            pool.query(
              "INSERT INTO users (username, email, hashed_password, first_name, last_name, phone_number, country) VALUES ($1, $2, $3, $4, $5, $6, $7)",
              [
                username,
                email,
                hashedPassword,
                first_name,
                last_name,
                phone_number,
                country,
              ],
              (err, result) => {
                if (err) {
                  console.error("Error executing the query:", err);
                  res.render("register", {
                    error: "An error occurred. Please try again later.",
                  });
                }
                // Redirect to the login page
                else {
                  req.flash(
                    "success",
                    "You have successfully created an account. Enter your login details below to login."
                  );
                  res.redirect("/login");
                }
              }
            );
          }
        }
      }
    );
  });

//Route to render the home page
app.get("/index", (req, res) => {
  // Check if the user is logged in
  if (req.session.user) {
    // Fetch the user's first name from the database based on the logged-in user's email
    const userEmail = req.session.user.email;
    pool.query(
      "SELECT first_name FROM users WHERE email = $1",
      [userEmail],
      (err, result) => {
        if (err) {
          console.error("Error executing the query:", err);
          return res.status(500).send("Error retrieving user details");
        }
        const user = result.rows[0];
        const firstName = user ? user.first_name : "____";

        // Fetch recipes created by the logged-in user
        pool.query(
          "SELECT id, image_filename, title, description FROM recipes WHERE user_id = $1",
          [req.session.user.id],
          (err, userRecipesResult) => {
            if (err) {
              console.error("Error executing the query:", err);
              return res.status(500).send("Error retrieving user recipes");
            }

            const userRecipes = userRecipesResult.rows;

            // Fetch all recipes from the database
            pool.query(
              "SELECT id, image_filename, title, description FROM recipes",
              (err, allRecipesResult) => {
                if (err) {
                  console.error("Error executing the query:", err);
                  return res.status(500).send("Error retrieving all recipes");
                }

                const allRecipes = allRecipesResult.rows;

                // Render the index page with the first name, user recipes, and all recipes
                res.render("index", { firstName, userRecipes, allRecipes });
              }
            );
          }
        );
      }
    );
  }

  // Set a default value for the first name if the user is not logged in
  else {
    res.render("index", { firstName: "___" });
  }
});

//render the template to add a completely new recipe
app.get("/newrecipe", (req, res) => {
  if (req.session.user) {
    const userEmail = req.session.user.email;
    pool.query(
      "SELECT first_name FROM users WHERE email = $1",
      [userEmail],
      (err, result) => {
        if (err) {
          console.error("Error executing the query:", err);
          res.render("newrecipe", { firstName: "____", recipeId: null });
        } else {
          const user = result.rows[0];

          if (user) {
            const firstName = user.first_name;
            const recipeId = null; // Set recipeId to null for instances when adding a new recipe
            const recipe = null; // Set recipe to null for imstances wehn adding a new recipe
            res.render("newrecipe", { firstName, recipeId, recipe });
          } else {
            res.render("newrecipe", { firstName: "____", recipeId: null });
          }
        }
      }
    );
  } else {
    res.render("newrecipe", { firstName: "___", recipeId: null });
  }
});

// Handle form submission on "submit button" click for adding a new recipe
app.post("/newrecipes", upload.single("image"), (req, res) => {
  const {
    title,
    description,
    servings,
    ingredient_name,
    procedure_description,
  } = req.body;

  // Retrieve the userId from the session
  const userId = req.session.userId;

  // Retrieve the uploaded image file details
  const image = req.file;

  // Construct the ingredients array
  const ingredients = [];
  for (let i = 0; i < ingredient_name.length; i++) {
    const ingredient = { name: ingredient_name[i] };
    ingredients.push(ingredient);
  }

  // Construct the cooking procedures array
  const cookingProcedures = [];
  for (let i = 0; i < procedure_description.length; i++) {
    const procedure = { description: procedure_description[i] };
    cookingProcedures.push(procedure);
  }

  // Prepare the query to insert the new recipe
  const query = {
    text: "INSERT INTO recipes (user_id, title, servings, description, ingredients, cooking_procedures, image_filename) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
    values: [
      userId,
      title,
      servings,
      description,
      JSON.stringify(ingredients),
      JSON.stringify(cookingProcedures),
      image.filename,
    ],
  };

  // Execute the query
  pool
    .query(query)
    .then((result) => {
      const recipeId = result.rows[0].id;
      // Retrieve the user details from the database using the user's id
      pool.query(
        "SELECT first_name FROM users WHERE id = $1",
        [userId],
        (err, userResult) => {
          // Handle an error appropriately
          if (err) {
            console.error("Error retrieving user details:", err);
            return res.status(500).send("Error retrieving user details");
          }

          // Extract the first name from the query result
          const firstName = userResult.rows[0].first_name;

          // Prepare the query to retrieve the newly created recipe
          const recipeQuery = {
            text: "SELECT * FROM recipes WHERE id = $1",
            values: [recipeId],
          };

          // Execute the query to retrieve the recipe details
          pool.query(recipeQuery, (err, recipeResult) => {
            // Handle the error appropriately
            if (err) {
              console.error("Error retrieving recipe details:", err);
              return res.status(500).send("Error retrieving recipe details");
            }

            // Extract the recipe details from the query result
            const recipe = recipeResult.rows[0];

            // Get the path to the recipe image
            const imagePath = path.join("/images", recipe.image_filename);

            // Render the confirmation page with the recipeId, firstName, recipe details, and image path
            res.render("confirmation", {
              recipeId,
              firstName,
              recipe,
              imagePath,
            });
          });
        }
      );
    })

    //Handle error with the query
    .catch((err) => {
      console.error("Error executing the query:", err);
      res.render("newrecipe", {
        error: "An error occurred. Please try again later.",
      });
    });
});

// Handle Confirmation page route
app.get("/confirmation/:recipeId", (req, res) => {
  const recipeId = req.params.recipeId;
});

// Route to handle editing of the recipe and render the newrecipe.ejs template for editing
app.get("/editrecipe/:recipeId", (req, res) => {
  const recipeId = req.params.recipeId;

  pool.query(
    "SELECT * FROM recipes WHERE id = $1",
    [recipeId],
    (err, result) => {
      if (err) {
        console.log(err);
        return res.render("confirmation", {
          error: "The recipe could not be found",
        });
      }

      const recipe = result.rows[0];

      if (req.session.user) {
        const userEmail = req.session.user.email;
        pool.query(
          "SELECT first_name FROM users WHERE email = $1",
          [userEmail],
          (err, result) => {
            if (err) {
              console.error("Error executing the query:", err);
              res.render("newrecipe", { firstName: "____", recipeId, recipe });
            } else {
              const user = result.rows[0];
              const firstName = user ? user.first_name : "____";
              res.render("newrecipe", { firstName, recipeId, recipe });
            }
          }
        );
      } else {
        res.render("newrecipe", { firstName: "____", recipeId, recipe });
      }
    }
  );
});

//route to handle saving the edited form and updating the database with the edits
app.post("/saverecipe/:recipeId", upload.single("image"), (req, res) => {
  const recipeId = req.params.recipeId;

  const {
    title,
    description,
    servings,
    ingredient_name,
    procedure_description,
  } = req.body;

  // Retrieve the uploaded image file details
  const image = req.file;

  // Construct the ingredients array
  const ingredients = [];
  for (let i = 0; i < ingredient_name.length; i++) {
    const ingredient = { name: ingredient_name[i] };
    ingredients.push(ingredient);
  }

  // Construct the cooking procedures array
  const cookingProcedures = [];
  for (let i = 0; i < procedure_description.length; i++) {
    const procedure = { description: procedure_description[i] };
    cookingProcedures.push(procedure);
  }

  // Prepare the query to update the recipe
  let queryText = `UPDATE recipes SET title = $1, servings = $2, description = $3, ingredients = $4, cooking_procedures = $5`;
  const queryValues = [
    title,
    servings,
    description,
    JSON.stringify(ingredients),
    JSON.stringify(cookingProcedures),
  ];

  // Update the query and values if an image was uploaded
  if (image) {
    queryText += `, image_filename = $6`;
    queryValues.push(image.filename);
  }

  queryText += ` WHERE id = $${queryValues.length + 1} AND user_id = $${
    queryValues.length + 2
  }`;
  queryValues.push(recipeId, req.session.userId);

  // Execute the query to update the recipe
  pool
    .query(queryText, queryValues)
    .then(() => {
      // Retrieve the user details from the database using the user's id
      pool.query(
        "SELECT first_name FROM users WHERE id = $1",
        [req.session.userId],
        (err, userResult) => {
          if (err) {
            console.error("Error retrieving user details:", err);
            // Handle the error appropriately
            return res.status(500).send("Error retrieving user details");
          }

          // Extract the first name from the query result
          const firstName = userResult.rows[0].first_name;

          // Prepare the query to retrieve the updated recipe
          const recipeQuery = {
            text: "SELECT * FROM recipes WHERE id = $1",
            values: [recipeId],
          };

          // Execute the query to retrieve the recipe details
          pool.query(recipeQuery, (err, recipeResult) => {
            if (err) {
              console.error("Error retrieving recipe details:", err);
              // Handle the error appropriately
              return res.status(500).send("Error retrieving recipe details");
            }

            // Extract the recipe details from the query result
            const recipe = recipeResult.rows[0];

            // Get the path to the recipe image
            const imagePath = path.join("/images", recipe.image_filename);

            // Render the confirmation page with the recipeId, firstName, recipe details, and image path
            res.render("confirmation", {
              recipeId,
              firstName,
              recipe,
              imagePath,
            });
          });
        }
      );
    })

    .catch((err) => {
      console.error("Error executing the query:", err);
      res.render("editrecipe", {
        error: "An error occurred. Please try again later.",
      });
    });
});

// Set up the route for the root URL
app.get("/", (req, res) => {
  res.redirect("/login"); // Redirect to the login page
});

//Route to handle logout function
app.get("/logout", (req, res) => {
  // Destroy the session and redirect the user to the login page
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
    }
    res.redirect("/login");
  });
});

// NEW: User Profile Route
app.get("/profile", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }

  const userId = req.session.user.id;
  
  // Get user profile data
  pool.query(
    "SELECT id, username, email, first_name, last_name, phone_number, country FROM users WHERE id = $1",
    [userId],
    (err, userResult) => {
      if (err) {
        console.error("Error fetching user profile:", err);
        return res.status(500).send("Error retrieving user profile");
      }
      
      const userProfile = userResult.rows[0];
      
      // Count user's recipes
      pool.query(
        "SELECT COUNT(*) as count FROM recipes WHERE user_id = $1",
        [userId],
        (err, recipesResult) => {
          if (err) {
            console.error("Error counting recipes:", err);
            return res.status(500).send("Error retrieving recipe count");
          }
          
          const recipesCount = recipesResult.rows[0].count;
          
          // Count user's favorite recipes
          pool.query(
            "SELECT COUNT(*) as count FROM favorites WHERE user_id = $1",
            [userId],
            (err, favoritesResult) => {
              if (err) {
                console.error("Error counting favorites:", err);
                return res.status(500).send("Error retrieving favorites count");
              }
              
              const favoritesCount = favoritesResult.rows[0].count;
              
              // Render the profile page with all the data
              res.render("userprofile", {
                userProfile,
                recipesCount,
                favoritesCount,
                successMessage: req.flash("success"),
                errorMessage: req.flash("error")
              });
            }
          );
        }
      );
    }
  );
});

// NEW: Update Profile Route
app.post("/profile/update", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }

  const userId = req.session.user.id;
  const {
    username,
    email,
    first_name,
    last_name,
    phone_number,
    country,
    current_password,
    new_password,
    confirm_password
  } = req.body;

  // First verify current password
  pool.query(
    "SELECT hashed_password FROM users WHERE id = $1",
    [userId],
    (err, result) => {
      if (err) {
        console.error("Error verifying password:", err);
        req.flash("error", "An error occurred. Please try again.");
        return res.redirect("/profile");
      }

      const user = result.rows[0];
      const passwordMatch = bcrypt.compareSync(current_password, user.hashed_password);

      if (!passwordMatch) {
        req.flash("error", "Current password is incorrect.");
        return res.redirect("/profile");
      }

      // Password verified, now update the profile
      let queryText = `
        UPDATE users 
        SET username = $1, email = $2, first_name = $3, last_name = $4, 
            phone_number = $5, country = $6
      `;
      
      let queryParams = [
        username, 
        email, 
        first_name, 
        last_name, 
        phone_number, 
        country
      ];

      // If new password is provided, update it as well
      if (new_password && new_password === confirm_password) {
        const hashedPassword = bcrypt.hashSync(new_password, 10);
        queryText += `, hashed_password = $${queryParams.length + 1}`;
        queryParams.push(hashedPassword);
      }

      queryText += ` WHERE id = $${queryParams.length + 1}`;
      queryParams.push(userId);

      pool.query(queryText, queryParams, (err) => {
        if (err) {
          console.error("Error updating profile:", err);
          req.flash("error", "An error occurred while updating your profile.");
          return res.redirect("/profile");
        }

        // Update session with new user data
        pool.query(
          "SELECT * FROM users WHERE id = $1",
          [userId],
          (err, result) => {
            if (!err && result.rows[0]) {
              req.session.user = result.rows[0];
            }
            
            req.flash("success", "Profile updated successfully!");
            res.redirect("/profile");
          }
        );
      });
    }
  );
});

// Start the server
app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
