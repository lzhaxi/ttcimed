/**
 * Slash command definitions shared between runtime and registration.
 */

export const REGISTER_COMMAND = {
  name: 'register',
  description: 'Join the table tennis tournament',
  type: 1,
};

export const REPORT_SCORE_COMMAND = {
  name: 'report-score',
  description: 'Report your match result',
  type: 1,
  options: [
    { name: 'opponent', description: 'Your opponent', type: 6, required: true },
    { name: 'your_score', description: 'Your score', type: 4, required: true },
    { name: 'opponent_score', description: "Opponent's score", type: 4, required: true },
  ],
};

export const MY_MATCH_COMMAND = {
  name: 'my-match',
  description: 'View your current opponent and deadline',
  type: 1,
};

export const TOURNAMENT_COMMAND = {
  name: 'tournament',
  description: 'View the current tournament standings or single-elimination bracket',
  type: 1,
};

export const START_TOURNAMENT_COMMAND = {
  name: 'start-tournament',
  description: 'Open registration for a new tournament (TO only)',
  type: 1,
  options: [
    { name: 'name', description: 'Name of the tournament', type: 3, required: true },
  ],
};

export const FORCE_MATCH_WINNER_COMMAND = {
  name: 'force-match-winner',
  description: 'Manually resolve or override a match (TO only). If winner omitted, selection depends on phase.',
  type: 1,
  options: [
    { name: 'player_1', description: 'First player', type: 6, required: true },
    { name: 'player_2', description: 'Second player', type: 6, required: true },
    { name: 'winner', description: 'Winning player (optional)', type: 6, required: false },
  ],
};

export const UNDO_MATCH_RESULT_COMMAND = {
  name: 'undo-match-result',
  description: 'Revert a match to pending and recalculate standings (TO only)',
  type: 1,
  options: [
    { name: 'player_1', description: 'First player', type: 6, required: true },
    { name: 'player_2', description: 'Second player', type: 6, required: true },
  ],
};

export const NEXT_ROUND_COMMAND = {
  name: 'next-round',
  description: 'Close registration & start Round 1, or advance to the next round (TO only)',
  type: 1,
  options: [
    { name: 'force', description: 'Force-resolve any incomplete matches (true/false)', type: 5, required: false },
    { name: 'extend_deadline', description: 'Push the deadline back an extra week (true/false)', type: 5, required: false },
  ],
};


export const HELP_COMMAND = {
  name: 'help',
  description: 'Show help for commands or a specific command',
  type: 1,
  options: [
    { name: 'command', description: 'Optional command to get detailed help for', type: 3, required: false },
  ],
};

export const RULES_COMMAND = {
  name: 'rules',
  description: 'Show tournament rules',
  type: 1,
};

export const TO_ADD_COMMAND = {
  name: 'to-add',
  description: 'Add a user to the tournament organizers list (TO only)',
  type: 1,
  options: [
    { name: 'user', description: 'The user to add as a TO', type: 6, required: true },
  ],
};

export const TO_REMOVE_COMMAND = {
  name: 'to-remove',
  description: 'Remove a user from the tournament organizers list (TO only)',
  type: 1,
  options: [
    { name: 'user', description: 'The user to remove', type: 6, required: true },
  ],
};

export const CANCEL_TOURNAMENT_COMMAND = {
  name: 'cancel-tournament',
  description: 'Cancel and delete the active tournament (TO only)',
  type: 1,
  options: [
    { name: 'confirm', description: 'Type "Yes" to confirm deletion of the tournament and all its data', type: 3, required: true },
  ],
};

export const HISTORY_COMMAND = {
  name: 'history',
  description: 'View match history, standings, or bracket for a tournament',
  type: 1,
  options: [
    {
      name: 'player',
      description: 'View match history for a specific player',
      type: 1,
      options: [
        { name: 'user', description: 'The player', type: 6, required: true },
        { name: 'tournament', description: 'Tournament ID (optional)', type: 4, required: false }
      ]
    },
    {
      name: 'standings',
      description: 'View final standings for a tournament',
      type: 1,
      options: [
        { name: 'tournament', description: 'Tournament ID (optional)', type: 4, required: false }
      ]
    },
    {
      name: 'bracket',
      description: 'View the Top Cut bracket for a tournament',
      type: 1,
      options: [
        { name: 'tournament', description: 'Tournament ID (optional)', type: 4, required: false }
      ]
    }
  ]
};

export const TOURNAMENTS_COMMAND = {
  name: 'tournaments',
  description: 'List past tournaments and their IDs',
  type: 1,
};

export const DQ_COMMAND = {
  name: 'dq',
  description: 'Disqualify a player, dropping them from the tournament and granting their opponent a win',
  type: 1,
  options: [
    { name: 'player', description: 'The player to disqualify', type: 6, required: true },
  ],
};


export const ALL_COMMANDS = [
  REGISTER_COMMAND,
  REPORT_SCORE_COMMAND,
  MY_MATCH_COMMAND,
  TOURNAMENT_COMMAND,
  START_TOURNAMENT_COMMAND,
  FORCE_MATCH_WINNER_COMMAND,
  UNDO_MATCH_RESULT_COMMAND,
  NEXT_ROUND_COMMAND,
  HELP_COMMAND,
  RULES_COMMAND,
  TO_ADD_COMMAND,
  TO_REMOVE_COMMAND,
  CANCEL_TOURNAMENT_COMMAND,
  HISTORY_COMMAND,
  TOURNAMENTS_COMMAND,
  DQ_COMMAND,
];

export const COMMAND_MAP = {
  ...Object.fromEntries(ALL_COMMANDS.map((c) => [c.name, c])),
  tournaments: TOURNAMENTS_COMMAND,
  dq: DQ_COMMAND,
};
