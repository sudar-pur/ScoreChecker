from flask import Flask, render_template, jsonify, request
import requests
from datetime import date

app = Flask(__name__)

# Sport configurations
SPORTS = {
    "nba": {
        "name": "NBA",
        "api": "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard",
        "favorite_team": "New York Knicks",
        "default_threshold": 10,
        "score_unit": "points",
    },
    "nfl": {
        "name": "NFL",
        "api": "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard",
        "favorite_team": "New York Jets",
        "default_threshold": 7,
        "score_unit": "points",
    },
    "mlb": {
        "name": "MLB",
        "api": "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard",
        "favorite_team": "New York Mets",
        "default_threshold": 2,
        "score_unit": "runs",
    },
    "nhl": {
        "name": "NHL",
        "api": "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard",
        "favorite_team": "New York Rangers",
        "default_threshold": 2,
        "score_unit": "goals",
    },
    "epl": {
        "name": "Premier League",
        "api": "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard",
        "favorite_team": "Arsenal",
        "default_threshold": 1,
        "score_unit": "goals",
    },
    "ncaab": {
        "name": "NCAAB",
        "api": "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard",
        "favorite_team": "Stanford Cardinal",
        "default_threshold": 10,
        "score_unit": "points",
    },
    "ncaaf": {
        "name": "NCAAF",
        "api": "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard",
        "favorite_team": "Stanford Cardinal",
        "default_threshold": 7,
        "score_unit": "points",
    },
}


@app.route("/")
def index():
    """Serve the main page."""
    return render_template("index.html")


@app.route("/api/sports")
def get_sports():
    """Get available sports and their configurations."""
    sports_list = []
    for key, config in SPORTS.items():
        sports_list.append({
            "id": key,
            "name": config["name"],
            "favorite_team": config["favorite_team"],
            "default_threshold": config["default_threshold"],
            "score_unit": config["score_unit"],
        })
    return jsonify({"sports": sports_list})


@app.route("/api/games")
def get_games():
    """Get games for a specific sport and date."""
    sport = request.args.get("sport", "nba")
    game_date = request.args.get("date", date.today().isoformat())

    if sport not in SPORTS:
        return jsonify({"error": f"Unknown sport: {sport}", "games": []}), 400

    sport_config = SPORTS[sport]
    # ESPN expects YYYYMMDD format
    espn_date = game_date.replace("-", "")

    try:
        response = requests.get(
            sport_config["api"],
            params={"dates": espn_date},
            timeout=10
        )
        response.raise_for_status()
        data = response.json()

        games = []
        for event in data.get("events", []):
            competition = event["competitions"][0]
            competitors = competition["competitors"]

            # Find home and away teams
            home_team_data = next((c for c in competitors if c["homeAway"] == "home"), competitors[0])
            away_team_data = next((c for c in competitors if c["homeAway"] == "away"), competitors[1] if len(competitors) > 1 else competitors[0])

            home_team = home_team_data["team"]
            away_team = away_team_data["team"]

            # Get game status
            status_type = event["status"]["type"]["name"]
            status_detail = event["status"]["type"]["shortDetail"]
            if status_type == "STATUS_FINAL" or status_detail in ["FT", "Final"]:
                status = "Final"
            elif status_type == "STATUS_IN_PROGRESS":
                status = status_detail
            else:
                status = status_detail

            games.append({
                "id": event["id"],
                "date": event["date"],
                "status": status,
                "home_team": {
                    "name": home_team.get("displayName", home_team.get("name", "Home")),
                    "abbreviation": home_team.get("abbreviation", ""),
                    "score": int(home_team_data.get("score", 0) or 0),
                    "logo": home_team.get("logo", ""),
                },
                "away_team": {
                    "name": away_team.get("displayName", away_team.get("name", "Away")),
                    "abbreviation": away_team.get("abbreviation", ""),
                    "score": int(away_team_data.get("score", 0) or 0),
                    "logo": away_team.get("logo", ""),
                },
            })

        return jsonify({
            "games": games,
            "date": game_date,
            "sport": sport,
            "config": {
                "favorite_team": sport_config["favorite_team"],
                "default_threshold": sport_config["default_threshold"],
                "score_unit": sport_config["score_unit"],
            }
        })

    except requests.RequestException as e:
        return jsonify({"error": str(e), "games": []}), 500


@app.route("/api/check")
def check_game():
    """Check if a game is worth watching."""
    my_team = request.args.get("my_team")  # "home" or "away"
    threshold = int(request.args.get("threshold", 10))
    score_unit = request.args.get("score_unit", "points")
    # Get scores passed from frontend (already fetched)
    home_score = int(request.args.get("home_score", 0))
    away_score = int(request.args.get("away_score", 0))
    home_team = request.args.get("home_team", "Home Team")
    away_team = request.args.get("away_team", "Away Team")
    game_status = request.args.get("status", "Final")

    # Determine my team's score and opponent's score
    if my_team == "home":
        my_score = home_score
        opp_score = away_score
        my_team_name = home_team
    else:
        my_score = away_score
        opp_score = home_score
        my_team_name = away_team

    # Check if game is finished
    if game_status != "Final":
        # Calculate current differential for in-progress games (hidden until user asks)
        point_diff = my_score - opp_score
        if my_score > opp_score:
            diff_status = "winning"
            diff_msg = f"{my_team_name} is winning by {abs(point_diff)} {score_unit}."
        elif my_score < opp_score:
            diff_status = "losing"
            diff_msg = f"{my_team_name} is losing by {abs(point_diff)} {score_unit}."
        else:
            diff_status = "tied"
            diff_msg = "The game is tied!"

        within_threshold = abs(point_diff) <= threshold or my_score >= opp_score

        # Apply same logic as finished games - is it currently worth watching?
        if my_score >= opp_score:
            worth_watching = True
            reason = f"Game still in progress ({game_status})"
        elif abs(point_diff) <= threshold:
            worth_watching = True
            reason = f"Game still in progress ({game_status})"
        else:
            worth_watching = False
            reason = f"Currently outside your {threshold}-{score_unit} threshold ({game_status})"

        return jsonify({
            "worth_watching": worth_watching,
            "reason": reason,
            "game_finished": False,
            "game_in_progress": True,
            "my_team_name": my_team_name,
            # Differential info (hidden until revealed)
            "differential_info": {
                "differential": abs(point_diff),
                "diff_status": diff_status,
                "diff_msg": diff_msg,
                "within_threshold": within_threshold,
                "threshold": threshold,
                "score_unit": score_unit,
            }
        })

    # Determine if worth watching
    point_diff = my_score - opp_score

    if my_score > opp_score:
        # My team won!
        worth_watching = True
    elif abs(point_diff) <= threshold:
        # Lost but within threshold
        worth_watching = True
    else:
        # Lost by more than threshold
        worth_watching = False

    # Don't spoil the outcome in the reason!
    if worth_watching:
        reason = f"This game meets your criteria for {my_team_name}!"
    else:
        reason = f"This game doesn't meet your {threshold}-{score_unit} threshold for {my_team_name}."

    return jsonify({
        "worth_watching": worth_watching,
        "reason": reason,
        "game_finished": True,
        "score": {
            "home_team": home_team,
            "home_score": home_score,
            "away_team": away_team,
            "away_score": away_score,
        }
    })


if __name__ == "__main__":
    app.run(debug=True, port=5000)
