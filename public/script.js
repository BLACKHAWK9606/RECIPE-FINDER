const header = document.querySelector("header");

window.addEventListener("scroll", function () {
  header.classList.toggle("sticky", window.scrollY > 0);
});

let menu = document.querySelector("#menu-icon");
let navbar = document.querySelector(".navbar");

menu.onclick = () => {
  menu.classList.toggle("bx-x");
  navbar.classList.toggle("open");
};

window.onscroll = () => {
  menu.classList.remove("bx-x");
  navbar.classList.remove("open");
};

document.addEventListener("DOMContentLoaded", function () {
  const recipeButtons = document.querySelectorAll(".recipe-button");
  const modal = document.querySelector(".modal");
  const modalContent = document.querySelector(".modal-content");

  recipeButtons.forEach(function (button, index) {
    button.addEventListener("click", function () {
      const title = this.dataset.recipeTitle;
      const image = this.dataset.recipeImage;
      const description = this.dataset.recipeDescription;
      const servings = this.dataset.recipeServings;
      const ingredients = JSON.parse(this.dataset.recipeIngredients);
      const procedures = JSON.parse(this.dataset.recipeProcedures);

      modalContent.innerHTML = `
        <h3>${title}</h3>
        <img src="${image}" alt="${title}" />
        <p>${description}</p>
        <p>Servings: ${servings}</p>
        <h4>Ingredients:</h4>
        <ul>
          ${ingredients.map((ingredient) => `<li>${ingredient}</li>`).join("")}
        </ul>
        <h4>Procedure:</h4>
        <ul>
          ${procedures.map((procedure) => `<li>${procedure}</li>`).join("")}
        </ul>

        <div class="modal-navigation">
          <button class="modal-previous-button" ${
            index === 0 ? "disabled" : ""
          }>Previous</button>
          <button class="modal-next-button" ${
            index === recipeButtons.length - 1 ? "disabled" : ""
          }>Next</button>
        </div>
        <div class="modal-cancel-button">
          <button class="modal-close-button">Cancel</button>
        </div>
      `;

      // Event listener for previous button
      const previousButton = document.querySelector(".modal-previous-button");
      previousButton.addEventListener("click", function () {
        renderRecipeModal(index - 1);
      });

      // Event listener for next button
      const nextButton = document.querySelector(".modal-next-button");
      nextButton.addEventListener("click", function () {
        renderRecipeModal(index + 1);
      });

      // Event listener for close button
      const closeButton = document.querySelector(".modal-close-button");
      closeButton.addEventListener("click", function () {
        modal.classList.add("modal-hidden");
      });

      // Show the modal
      modal.classList.remove("modal-hidden");
    });
  });
});
