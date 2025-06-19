const express = require("express");
const { Pool } = require("pg");
const session = require("express-session");
const app = express();
const bodyParser = require("body-parser");
const port = 4486;
const path = require("path");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const secret = crypto.randomBytes(32).toString("hex");
const multer = require("multer");
const flash = require("connect-flash");

// Configure PostgreSQL connection pool:
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  port: 5432,
  password: "Jayjay_1",
  database: "recipe_organizer",
});

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/images"); // Set the destination folder for uploaded images
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + "." + file.mimetype.split("/")[1]
    );
  },
});
const upload = multer({ storage: storage });

app.use(
  session({
    secret: secret,
    resave: false,
    saveUninitialized: true,
  })
);
console.log("Generated secret key:", secret);

// Set the view engine and specify the views directory:
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// Serve static files from the public directory:
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.urlencoded({ extended: true }));
app.use(flash());
app.use(express.json()); // parse JSON bodies from fetch requests

// Set flash messages as locals
app.use((req, res, next) => {
  res.locals.successMessage = req.flash("success");
  res.locals.errorMessage = req.flash("error");
  next();
});

// (Optional) Import additional routes if any
const routes = require("./routes");
app.use("/", routes);

// Login Route
app
  .route("/login")
  .get((req, res) => {
    const successMessage = req.flash("success");
    res.render("login", { successMessage });
  })
  .post((req, res) => {
    const { username, password } = req.body; // Using 'username' instead of 'email'
    pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username],
      (err, result) => {
        if (err) {
          console.error("Error executing the query:", err);
          return res.render("login", {
            error: "An error occurred. Please try again later.",
          });
        }
        const user = result.rows[0];
        if (!user) {
          return res.render("login", {
            error: "Invalid username or password. Please try again.",
          });
        }

        const passwordMatch = bcrypt.compareSync(password, user.hashed_password);
        if (passwordMatch) {
          req.session.user = user;
          req.session.userId = user.id;
          console.log("User ID stored in session:", req.session.userId);
          req.flash("success", "You have successfully logged in.");
          res.redirect("/index");
        } else {
          res.render("login", {
            error: "Invalid username or password. Please try again.",
          });
        }
      }
    );
  });

// Registration Route
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
    pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email],
      (err, result) => {
        if (err) {
          console.error("Error executing the query:", err);
          return res.render("register", {
            error: "An error occurred. Please try again later.",
          });
        }
        const user = result.rows[0];
        if (user) {
          return res.render("register", {
            error: "Email already registered. Please choose a different email.",
          });
        }

        const hashedPassword = bcrypt.hashSync(password, 10);
        pool.query(
          `INSERT INTO users 
           (username, email, hashed_password, first_name, last_name, phone_number, country)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            username,
            email,
            hashedPassword,
            first_name,
            last_name,
            phone_number,
            country,
          ],
          (err) => {
            if (err) {
              console.error("Error executing the query:", err);
              return res.render("register", {
                error: "An error occurred. Please try again later.",
              });
            }
            req.flash(
              "success",
              "You have successfully created an account. Enter your login details below to login."
            );
            res.redirect("/login");
          }
        );
      }
    );
  });

// Updated /index Route (ONLY MODIFIED SQL QUERIES)
app.get("/index", (req, res) => {
  if (!req.session.user) {
    return res.render("index", {
      firstName: "___",
      allRecipes: [],
      userRecipes: [],
      favoriteRecipes: [],
    });
  }

  const userEmail = req.session.user.email;
  pool.query(
    "SELECT first_name FROM users WHERE email = $1",
    [userEmail],
    (err, result) => {
      if (err) {
        console.error("Error executing query:", err);
        return res.status(500).send("Error retrieving user details");
      }

      const user = result.rows[0];
      const firstName = user ? user.first_name : "____";

      // 1) Fetch userRecipes
      pool.query(
        `SELECT r.id, r.image_filename, r.title, r.description, r.created_at,
                r.ingredients, r.cooking_procedures, r.servings,
                u.username,
                EXISTS(
                  SELECT 1 FROM favorites f 
                  WHERE f.recipe_id = r.id AND f.user_id = $1
                ) as is_favorited
         FROM recipes r
         JOIN users u ON r.user_id = u.id
         WHERE r.user_id = $1`,
        [req.session.user.id],
        (err, userRecipesResult) => {
          if (err) {
            console.error("Error fetching user recipes:", err);
            return res.status(500).send("Error retrieving user recipes");
          }

          const userRecipes = userRecipesResult.rows;

          // 2) Fetch allRecipes
          pool.query(
            `SELECT r.id, r.image_filename, r.title, r.description,
                    r.ingredients, r.cooking_procedures, r.servings,
                    u.username,
                    EXISTS(
                      SELECT 1 FROM favorites f 
                      WHERE f.recipe_id = r.id AND f.user_id = $1
                    ) as is_favorited
             FROM recipes r
             JOIN users u ON r.user_id = u.id
             ORDER BY r.created_at DESC
             LIMIT 20`,
            [req.session.user.id],
            (err, allRecipesResult) => {
              if (err) {
                console.error("Error fetching all recipes:", err);
                return res.status(500).send("Error retrieving all recipes");
              }

              const allRecipes = allRecipesResult.rows;

              // 3) Fetch favoriteRecipes
              pool.query(
                `SELECT r.id, r.image_filename, r.title, r.description, r.created_at,
                        r.ingredients, r.cooking_procedures, r.servings,
                        u.username,
                        true as is_favorited
                 FROM favorites f
                 JOIN recipes r ON f.recipe_id = r.id
                 JOIN users u ON r.user_id = u.id
                 WHERE f.user_id = $1
                 ORDER BY f.created_at ASC`,
                [req.session.user.id],
                (err, favResult) => {
                  if (err) {
                    console.error("Error fetching favorite recipes:", err);
                    return res.status(500).send("Error retrieving favorite recipes");
                  }

                  res.render("index", {
                    firstName,
                    userRecipes,
                    allRecipes,
                    favoriteRecipes: favResult.rows,
                  });
                }
              );
            }
          );
        }
      );
    }
  );
});


// New Recipe Form Route
app.get("/newrecipe", (req, res) => {
  if (!req.session.user) {
    return res.render("newrecipe", {
      firstName: "___",
      recipeId: null,
      recipe: null,
    });
  }

  const userEmail = req.session.user.email;
  pool.query(
    "SELECT first_name FROM users WHERE email = $1",
    [userEmail],
    (err, result) => {
      if (err) {
        console.error("Error executing the query:", err);
        return res.render("newrecipe", {
          firstName: "____",
          recipeId: null,
          recipe: null,
        });
      }
      const user = result.rows[0];
      const firstName = user ? user.first_name : "____";
      res.render("newrecipe", { firstName, recipeId: null, recipe: null });
    }
  );
});

// New Recipe Submission Route (temporary storage)
app.post("/newrecipes", upload.single("image"), (req, res) => {
  const { title, description, servings, ingredient_name, procedure_description } =
    req.body;
  const userId = req.session.userId;
  const image = req.file;
  // Check if an image was uploaded
  const imageFilename = image ? image.filename : "";

  // Construct ingredients array
  let ingredients = [];
  if (ingredient_name) {
    if (Array.isArray(ingredient_name)) {
      ingredients = ingredient_name.map((name) => ({ name }));
    } else {
      ingredients.push({ name: ingredient_name });
    }
  }

  // Construct cooking procedures array
  let cookingProcedures = [];
  if (procedure_description) {
    if (Array.isArray(procedure_description)) {
      cookingProcedures = procedure_description.map((desc) => ({
        description: desc,
      }));
    } else {
      cookingProcedures.push({ description: procedure_description });
    }
  }

  // Store new recipe in session, not DB
  req.session.tempRecipe = {
    userId,
    title,
    servings,
    description,
    ingredients,
    cooking_procedures: cookingProcedures,
    imageFilename,
  };

  // Render confirmation page with session data
  const firstName = req.session.user ? req.session.user.first_name : "____";
  const imagePath = path.join("/images", imageFilename);

  res.render("confirmation", {
    recipeId: null,
    firstName,
    recipe: req.session.tempRecipe,
    imagePath,
  });
});

// Final Saving route after confirmation
app.post("/saverecipe", (req, res) => {
  if (!req.session.tempRecipe) {
    return res
      .status(400)
      .json({ success: false, message: "No recipe to save." });
  }

  const {
    userId,
    title,
    servings,
    description,
    ingredients,
    cooking_procedures,
    imageFilename,
  } = req.session.tempRecipe;

  const query = {
    text: `INSERT INTO recipes
           (user_id, title, servings, description, ingredients, cooking_procedures, image_filename)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    values: [
      userId,
      title,
      servings,
      description,
      JSON.stringify(ingredients),
      JSON.stringify(cooking_procedures),
      imageFilename,
    ],
  };

  pool
    .query(query)
    .then((result) => {
      delete req.session.tempRecipe; // clear
      res.json({ success: true, recipeId: result.rows[0].id });
    })
    .catch((err) => {
      console.error("Error saving the recipe:", err);
      res.status(500).json({ success: false, message: "Error saving the recipe." });
    });
});

// Confirmation Route (optional)
app.get("/confirmation/:recipeId", (req, res) => {
  const recipeId = req.params.recipeId;
  // You can fetch saved recipe if needed
});

// Edit Recipe Route
app.get("/editrecipe/:recipeId", (req, res) => {
  const recipeId = req.params.recipeId;
  pool.query("SELECT * FROM recipes WHERE id = $1", [recipeId], (err, result) => {
    if (err) {
      console.log(err);
      return res.render("confirmation", {
        error: "The recipe could not be found",
      });
    }
    const recipe = result.rows[0];
    if (!req.session.user) {
      return res.render("newrecipe", { firstName: "____", recipeId, recipe });
    }

    // If logged in, get first name
    const userEmail = req.session.user.email;
    pool.query(
      "SELECT first_name FROM users WHERE email = $1",
      [userEmail],
      (err, userResult) => {
        if (err) {
          console.error("Error executing the query:", err);
          return res.render("newrecipe", { firstName: "____", recipeId, recipe });
        }
        const user = userResult.rows[0];
        const firstName = user ? user.first_name : "____";
        res.render("newrecipe", { firstName, recipeId, recipe });
      }
    );
  });
});

// Save Edited Recipe Route
app.post("/saverecipe/:recipeId", upload.single("image"), (req, res) => {
  const recipeId = req.params.recipeId;
  const { title, description, servings, ingredient_name, procedure_description } =
    req.body;
  const image = req.file;

  // Construct arrays
  const ingredients = [];
  if (ingredient_name) {
    if (Array.isArray(ingredient_name)) {
      ingredient_name.forEach((name) => ingredients.push({ name }));
    } else {
      ingredients.push({ name: ingredient_name });
    }
  }
  const cookingProcedures = [];
  if (procedure_description) {
    if (Array.isArray(procedure_description)) {
      procedure_description.forEach((desc) =>
        cookingProcedures.push({ description: desc })
      );
    } else {
      cookingProcedures.push({ description: procedure_description });
    }
  }

  let queryText = `
    UPDATE recipes
    SET title = $1, servings = $2, description = $3,
        ingredients = $4, cooking_procedures = $5
  `;
  const queryValues = [
    title,
    servings,
    description,
    JSON.stringify(ingredients),
    JSON.stringify(cookingProcedures),
  ];

  if (image) {
    queryText += `, image_filename = $6`;
    queryValues.push(image.filename);
  }

  queryText += ` WHERE id = $${queryValues.length + 1}
                 AND user_id = $${queryValues.length + 2}`;
  queryValues.push(recipeId, req.session.userId);

  pool
    .query(queryText, queryValues)
    .then(() => {
      pool.query(
        "SELECT first_name FROM users WHERE id = $1",
        [req.session.userId],
        (err, userResult) => {
          if (err) {
            console.error("Error retrieving user details:", err);
            return res.status(500).send("Error retrieving user details");
          }
          const firstName = userResult.rows[0].first_name;
          const recipeQuery = {
            text: "SELECT * FROM recipes WHERE id = $1",
            values: [recipeId],
          };
          pool.query(recipeQuery, (err, recipeResult) => {
            if (err) {
              console.error("Error retrieving recipe details:", err);
              return res.status(500).send("Error retrieving recipe details");
            }
            const updatedRecipe = recipeResult.rows[0];
            const imagePath = path.join("/images", updatedRecipe.image_filename);
            res.render("confirmation", {
              recipeId,
              firstName,
              recipe: updatedRecipe,
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

// NEW route: Add recipe to favorites
app.post("/favorite", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: "Not logged in" });
  }

  const { recipeId } = req.body;
  const userId = req.session.user.id;

  // Check if favorite already exists
  pool.query(
    "SELECT id FROM favorites WHERE recipe_id = $1 AND user_id = $2",
    [recipeId, userId],
    (err, result) => {
      if (err) {
        console.error("Error checking favorite existence:", err);
        return res.status(500).json({ success: false, message: "DB Error" });
      }
      if (result.rowCount > 0) {
        // Already a favorite
        return res.json({ success: true, message: "Already in favorites" });
      } else {
        // Insert new favorite record
        pool.query(
          "INSERT INTO favorites (recipe_id, user_id, created_at) VALUES ($1, $2, NOW())",
          [recipeId, userId],
          (err2) => {
            if (err2) {
              console.error("Error inserting favorite:", err2);
              return res
                .status(500)
                .json({ success: false, message: "DB Error" });
            }
            return res.json({ success: true });
          }
        );
      }
    }
  );
});

// Root URL
app.get("/", (req, res) => {
  res.redirect("/login");
});

// Logout Route
app.get("/logout", (req, res) => {
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

// NEW: View Recipe Details Route
app.get("/recipe/:recipeId", (req, res) => {
  const recipeId = req.params.recipeId;
  
  pool.query(
    "SELECT * FROM recipes WHERE id = $1",
    [recipeId],
    (err, result) => {
      if (err) {
        console.error("Error retrieving recipe:", err);
        return res.status(500).send("Error retrieving recipe details");
      }
      
      if (result.rows.length === 0) {
        return res.status(404).render("error", { 
          message: "Recipe not found",
          error: { status: 404 }
        });
      }
      
      const recipe = result.rows[0];
      
      // Get user information
      pool.query(
        "SELECT username FROM users WHERE id = $1",
        [recipe.user_id],
        (err, userResult) => {
          if (err) {
            console.error("Error retrieving user:", err);
            return res.status(500).send("Error retrieving user details");
          }
          
          const user = userResult.rows[0] || { username: "Unknown" };
          
          // Render the recipe page with recipe and user data
          res.render("recipe", {
            recipe,
            user,
            ratings: [],  // You can populate these from your database if available
            comments: []  // You can populate these from your database if available
          });
        }
      );
    }
  );
});

// Simple search page (displays all recipes when no filter/query is applied)
app.get("/search", (req, res) => {
  const { query, filter } = req.query;
  
  // If query and filter are provided, handle the search
  if (query || filter) {
    let sqlQuery = `
      SELECT r.*, u.username, 
      CASE WHEN f.id IS NOT NULL THEN true ELSE false END AS is_favorited
      FROM recipes r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN favorites f ON r.id = f.recipe_id AND f.user_id = $1
      WHERE 1=1
    `;
    let queryParams = [req.session.user ? req.session.user.id : null];

    // Add search condition if query parameter exists
    if (query && query.trim() !== '') {
      sqlQuery += ` AND (
        r.title ILIKE $${queryParams.length + 1} 
        OR r.description ILIKE $${queryParams.length + 1}
        OR u.username ILIKE $${queryParams.length + 1}
      )`;
      queryParams.push(`%${query}%`);
    }

    // Apply filters if specified
    if (filter) {
      if (filter === 'favorites' && req.session.user) {
        sqlQuery += ` AND f.id IS NOT NULL`;
      } else if (filter === 'my-recipes' && req.session.user) {
        sqlQuery += ` AND r.user_id = $1`;
      }
    }

    sqlQuery += ` ORDER BY r.created_at DESC`;

    pool.query(sqlQuery, queryParams, (err, result) => {
      if (err) {
        console.error("Error executing search query:", err);
        return res.status(500).send("Error searching recipes");
      }

      const searchResults = result.rows;
      let firstName = "Guest";

      if (req.session.user) {
        pool.query(
          "SELECT first_name FROM users WHERE id = $1",
          [req.session.user.id],
          (err, userResult) => {
            if (err) {
              console.error("Error retrieving user details:", err);
              renderSearchResults();
            } else {
              const user = userResult.rows[0];
              firstName = user ? user.first_name : "Guest";
              renderSearchResults();
            }
          }
        );
      } else {
        renderSearchResults();
      }

      function renderSearchResults() {
        res.render("search", {
          firstName,
          recipes: searchResults,
          searchQuery: query || "",
          activeFilter: filter || "all"
        });
      }
    });
  } else {
    // If no query/filter, just show all recipes
    pool.query(
      `SELECT r.*, u.username, 
      CASE WHEN f.id IS NOT NULL THEN true ELSE false END AS is_favorited
      FROM recipes r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN favorites f ON r.id = f.recipe_id AND f.user_id = $1
      ORDER BY r.created_at DESC`,
      [req.session.user ? req.session.user.id : null],
      (err, result) => {
        if (err) {
          console.error("Error fetching recipes:", err);
          return res.status(500).send("Error retrieving recipes");
        }

        const allRecipes = result.rows;
        let firstName = "Guest";

        if (req.session.user) {
          pool.query(
            "SELECT first_name FROM users WHERE id = $1",
            [req.session.user.id],
            (err, userResult) => {
              if (err) {
                console.error("Error retrieving user details:", err);
                renderAllRecipes();
              } else {
                const user = userResult.rows[0];
                firstName = user ? user.first_name : "Guest";
                renderAllRecipes();
              }
            }
          );
        } else {
          renderAllRecipes();
        }

        function renderAllRecipes() {
          res.render("search", {
            firstName,
            recipes: allRecipes,
            searchQuery: "",
            activeFilter: "all"
          });
        }
      }
    );
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
