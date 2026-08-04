const INTRO_CARDS = [
    {
        title: `Selam! ${icon('wave')}`,
        text: "Welcome to the Ultimate Fidel Challenge."
    },
    {
        title: "How to Level Up",
        text: "Complete your streak and submit your writing to help your team move forward."
    },
    {
        title: "Team First",
        text: "Your team only advances when everyone completes their part."
    }
];

let introCardIndex = 0;

function showIntroMascot() {
    introCardIndex = 0;

    const intro = document.getElementById("introMascotScreen");
    if (!intro) return;

    intro.classList.remove("exit");
    intro.style.display = "flex";

    renderIntroCard();
}

function renderIntroCard() {
    const card = INTRO_CARDS[introCardIndex];
    const introCard = document.getElementById("introCard");

    if (!introCard || !card) return;

    introCard.innerHTML = `
        <h2>${card.title}</h2>
        <p>${card.text}</p>
        <button id="introNextBtn">
            ${introCardIndex === INTRO_CARDS.length - 1 ? "Start →" : "Next →"}
        </button>
    `;

    document.getElementById("introNextBtn").onclick = nextIntroCard;
}

function nextIntroCard() {
    introCardIndex++;

    if (introCardIndex < INTRO_CARDS.length) {
        renderIntroCard();
        return;
    }

    const intro = document.getElementById("introMascotScreen");
    intro.classList.add("exit");

    setTimeout(() => {
        intro.style.display = "none";

        if (typeof enterModeSelect === "function") {
            enterModeSelect();
        }
    }, 600);
}

window.showIntroMascot = showIntroMascot;
