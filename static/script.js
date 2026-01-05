// DOM Elements
const sportSelect = document.getElementById('sport-select');
const datePicker = document.getElementById('game-date');
const gamesContainer = document.getElementById('games-container');
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const noGamesEl = document.getElementById('no-games');
const modal = document.getElementById('result-modal');
const resultIcon = document.getElementById('result-icon');
const resultTitle = document.getElementById('result-title');
const resultReason = document.getElementById('result-reason');
const scoreReveal = document.getElementById('score-reveal');
const showScoreBtn = document.getElementById('show-score-btn');
const finalScore = document.getElementById('final-score');
const closeBtn = document.querySelector('.close-btn');
const closeModalBtn = document.getElementById('close-modal-btn');

// Current sport configuration (loaded from API response)
let currentConfig = {
    favorite_team: "New York Knicks",
    default_threshold: 10,
    score_unit: "points"
};

// Store games data
let gamesData = {};
// Current score data for reveal
let currentScoreData = null;
// Current in-progress data
let currentInProgressData = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Set date picker to today
    const today = new Date().toISOString().split('T')[0];
    datePicker.value = today;

    // Load games for default sport
    loadGames(sportSelect.value, today);

    // Event listeners
    sportSelect.addEventListener('change', () => loadGames(sportSelect.value, datePicker.value));
    datePicker.addEventListener('change', () => loadGames(sportSelect.value, datePicker.value));
    closeBtn.addEventListener('click', closeModal);
    closeModalBtn.addEventListener('click', closeModal);
    showScoreBtn.addEventListener('click', handleScoreReveal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
});

// Check if a game involves the favorite team
function isFavoriteGame(game) {
    const favTeam = currentConfig.favorite_team.toLowerCase();
    return game.home_team.name.toLowerCase().includes(favTeam) ||
           game.away_team.name.toLowerCase().includes(favTeam) ||
           favTeam.includes(game.home_team.name.toLowerCase()) ||
           favTeam.includes(game.away_team.name.toLowerCase());
}

// Get default team selection for a game
function getDefaultTeam(game) {
    const favTeam = currentConfig.favorite_team.toLowerCase();
    if (game.away_team.name.toLowerCase().includes(favTeam) ||
        favTeam.includes(game.away_team.name.toLowerCase())) return "away";
    if (game.home_team.name.toLowerCase().includes(favTeam) ||
        favTeam.includes(game.home_team.name.toLowerCase())) return "home";
    return "away"; // default to away team
}

async function loadGames(sport, date) {
    // Show loading, hide others
    loadingEl.classList.remove('hidden');
    errorEl.classList.add('hidden');
    noGamesEl.classList.add('hidden');
    gamesContainer.innerHTML = '';
    gamesData = {};

    try {
        const response = await fetch(`/api/games?sport=${sport}&date=${date}`);
        const data = await response.json();

        loadingEl.classList.add('hidden');

        if (data.error) {
            errorEl.textContent = `Error: ${data.error}`;
            errorEl.classList.remove('hidden');
            return;
        }

        // Update current config from response
        if (data.config) {
            currentConfig = data.config;
        }

        if (data.games.length === 0) {
            noGamesEl.classList.remove('hidden');
            return;
        }

        // Sort games: favorite team games first
        const sortedGames = [...data.games].sort((a, b) => {
            const aIsFav = isFavoriteGame(a);
            const bIsFav = isFavoriteGame(b);
            if (aIsFav && !bIsFav) return -1;
            if (!aIsFav && bIsFav) return 1;
            return 0;
        });

        // Store games data for later use
        sortedGames.forEach(game => {
            gamesData[game.id] = game;
        });

        renderGames(sortedGames);

    } catch (err) {
        loadingEl.classList.add('hidden');
        errorEl.textContent = `Failed to load games: ${err.message}`;
        errorEl.classList.remove('hidden');
    }
}

function renderGames(games) {
    gamesContainer.innerHTML = games.map(game => {
        const defaultTeam = getDefaultTeam(game);
        const isFav = isFavoriteGame(game);

        return `
        <div class="game-card ${isFav ? 'favorite-game' : ''}" data-game-id="${game.id}">
            <div class="teams">
                <div class="team">
                    <img src="${game.away_team.logo}" alt="${game.away_team.name}" class="team-logo"
                         onerror="this.style.display='none'">
                    <span class="team-name">${game.away_team.name}</span>
                </div>
                <span class="vs">@</span>
                <div class="team">
                    <img src="${game.home_team.logo}" alt="${game.home_team.name}" class="team-logo"
                         onerror="this.style.display='none'">
                    <span class="team-name">${game.home_team.name}</span>
                </div>
            </div>
            <div class="game-controls">
                <span class="game-status ${game.status === 'Final' ? 'status-final' : game.status.includes(':') ? '' : 'status-live'}">
                    ${game.status}
                </span>
                <div class="control-group">
                    <label>My Team</label>
                    <select class="team-select">
                        <option value="away" ${defaultTeam === 'away' ? 'selected' : ''}>${game.away_team.name.split(' ').pop()}</option>
                        <option value="home" ${defaultTeam === 'home' ? 'selected' : ''}>${game.home_team.name.split(' ').pop()}</option>
                    </select>
                </div>
                <div class="control-group">
                    <label>Threshold</label>
                    <input type="number" class="threshold-input" value="${currentConfig.default_threshold}" min="1" max="50">
                </div>
                <button class="btn btn-primary check-btn" onclick="checkGame('${game.id}', this)">
                    Check
                </button>
            </div>
        </div>
    `}).join('');
}

async function checkGame(gameId, button) {
    const card = button.closest('.game-card');
    const teamSelect = card.querySelector('.team-select');
    const thresholdInput = card.querySelector('.threshold-input');

    const myTeam = teamSelect.value;
    const threshold = thresholdInput.value;

    // Get stored game data
    const game = gamesData[gameId];
    if (!game) {
        alert('Game data not found');
        return;
    }

    button.textContent = 'Checking...';
    button.disabled = true;

    try {
        const params = new URLSearchParams({
            game_id: gameId,
            my_team: myTeam,
            threshold: threshold,
            score_unit: currentConfig.score_unit,
            home_score: game.home_team.score,
            away_score: game.away_team.score,
            home_team: game.home_team.name,
            away_team: game.away_team.name,
            status: game.status
        });

        const response = await fetch(`/api/check?${params}`);
        const data = await response.json();

        button.textContent = 'Check';
        button.disabled = false;

        if (data.error) {
            alert(`Error: ${data.error}`);
            return;
        }

        showResult(data);

    } catch (err) {
        button.textContent = 'Check';
        button.disabled = false;
        alert(`Failed to check game: ${err.message}`);
    }
}

function showResult(data) {
    // Store score data for reveal
    currentScoreData = data.score;
    currentInProgressData = null;

    // Handle in-progress games - show "worth watching" first
    if (data.game_in_progress) {
        currentInProgressData = data.differential_info;
        resultIcon.textContent = '✅';
        resultTitle.textContent = 'Yes, watch it!';
        resultReason.textContent = data.reason;

        // Offer to show differential
        scoreReveal.classList.remove('hidden');
        showScoreBtn.textContent = 'Check Current Differential';
        showScoreBtn.classList.remove('hidden');
        finalScore.classList.add('hidden');

        modal.classList.remove('hidden');
        return;
    }

    // Handle finished games
    if (data.worth_watching) {
        resultIcon.textContent = '✅';
        resultTitle.textContent = 'Yes, watch it!';
    } else {
        resultIcon.textContent = '❌';
        resultTitle.textContent = 'Not worth watching';
    }

    resultReason.textContent = data.reason;

    // Show/hide score reveal option
    if (!data.worth_watching && data.game_finished) {
        scoreReveal.classList.remove('hidden');
        showScoreBtn.textContent = 'Show Final Score';
        finalScore.classList.add('hidden');
        showScoreBtn.classList.remove('hidden');
    } else {
        scoreReveal.classList.add('hidden');
    }

    // Show modal
    modal.classList.remove('hidden');
}

function handleScoreReveal() {
    // Handle in-progress game differential reveal
    if (currentInProgressData) {
        const info = currentInProgressData;
        let message = info.diff_msg;

        if (info.within_threshold) {
            message += ` Currently within your ${info.threshold}-${info.score_unit} threshold!`;
            finalScore.innerHTML = `
                <div class="diff-result good">
                    <p>${message}</p>
                </div>
            `;
        } else {
            message += ` Currently outside your ${info.threshold}-${info.score_unit} threshold.`;
            finalScore.innerHTML = `
                <div class="diff-result bad">
                    <p>${message}</p>
                </div>
            `;
        }

        showScoreBtn.classList.add('hidden');
        finalScore.classList.remove('hidden');
        return;
    }

    // Handle finished game score reveal
    if (!currentScoreData) return;

    const homeWon = currentScoreData.home_score > currentScoreData.away_score;

    finalScore.innerHTML = `
        <div class="score-line ${!homeWon ? 'winner' : ''}">
            <span>${currentScoreData.away_team}</span>
            <span>${currentScoreData.away_score}</span>
        </div>
        <div class="score-line ${homeWon ? 'winner' : ''}">
            <span>${currentScoreData.home_team}</span>
            <span>${currentScoreData.home_score}</span>
        </div>
    `;

    showScoreBtn.classList.add('hidden');
    finalScore.classList.remove('hidden');
}

function closeModal() {
    modal.classList.add('hidden');
    currentScoreData = null;
    currentInProgressData = null;
}
