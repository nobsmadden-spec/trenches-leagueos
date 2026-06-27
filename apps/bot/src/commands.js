/**
 * Framework-neutral Discord command handlers. Wire each function to discord.js
 * interaction adapters; keeping HTTP here makes the bot a client of the API.
 */
export function createLeagueCommands({ apiBaseUrl, fetchImpl = fetch }) {
  const get = async (path) => {
    const response = await fetchImpl(`${apiBaseUrl}${path}`);
    if (!response.ok) throw new Error(`League API returned ${response.status}`);
    return response.json();
  };

  return {
    standings: (leagueId) => get(`/api/leagues/${leagueId}/standings`),
    playoffRace: (leagueId) => get(`/api/leagues/${leagueId}/playoff-race`),
    powerRankings: (leagueId) => get(`/api/leagues/${leagueId}/power-rankings`),
    matchups: (leagueId) => get(`/api/leagues/${leagueId}/games`),
    roster: (leagueId, teamId) => get(`/api/leagues/${leagueId}/teams/${encodeURIComponent(teamId)}`),
    playerSearch: (leagueId, query) => get(`/api/leagues/${leagueId}/players?q=${encodeURIComponent(query)}`),
    teamList: (leagueId) => get(`/api/leagues/${leagueId}/teams`)
  };
}
