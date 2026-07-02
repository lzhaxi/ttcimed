/**
 * Cloudflare Worker entry point for the Ping Pong Tournament Bot.
 */

import { Router } from 'itty-router';
import { InteractionResponseType, InteractionType, verifyKey } from 'discord-interactions';
import { JsonResponse, defer } from './lib/discord.js';
import { ALL_COMMANDS } from './commands.js';
import { handleRegister } from './handlers/register.js';
import { handleReportScore } from './handlers/report-score.js';
import { handleMyMatch } from './handlers/my-match.js';
import { handleTournament } from './handlers/tournament.js';
import { handleStartTournament } from './handlers/start-tournament.js';
import { handleForceMatchWinner } from './handlers/force-match-winner.js';
import { handleUndoMatchResult } from './handlers/undo-match-result.js';
import { handleNextRound } from './handlers/next-round.js';
import { handleToAdd } from './handlers/to-add.js';
import { handleToRemove } from './handlers/to-remove.js';
import { handleRules } from './handlers/rules.js';
import { handleHelp } from './handlers/help.js';
import { handleCancelTournament } from './handlers/cancel-tournament.js';
import { handleHistory } from './handlers/history.js';
import { handleTournaments } from './handlers/tournaments.js';

const EPHEMERAL_COMMANDS = new Set([
  'register',
  'my-match',
  'rules',
  'help',
  'report-score',
  'tournament',
  'start-tournament',
  'next-round',
  'force-match-winner',
  'undo-match-result',
  'to-add',
  'to-remove',
  'cancel-tournament',
  'history',
  'tournaments'
]);

const router = Router();

router.get('/', (request, env) => {
  return new Response(`Ping Pong Tourney Bot — ${env.DISCORD_APPLICATION_ID ?? 'not configured'}`);
});

router.post('/', async (request, env, ctx) => {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  const body = await request.text();

  const isValid =
    signature &&
    timestamp &&
    await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY);

  if (!isValid) {
    return new Response('Bad request signature.', { status: 401 });
  }

  const interaction = JSON.parse(body);

  if (interaction.type === InteractionType.PING) {
    return new JsonResponse({ type: InteractionResponseType.PONG });
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const name = interaction.data.name.toLowerCase();
    const handler = COMMAND_HANDLERS[name];
    if (!handler) {
      return new JsonResponse({ error: `Unknown command: ${name}` }, { status: 400 });
    }

    const ephemeral = EPHEMERAL_COMMANDS.has(name);
    ctx.waitUntil(
      handler(interaction, env).catch((err) => {
        console.error(`Command ${name} failed:`, err);
      })
    );
    return defer(ephemeral);
  }

  return new JsonResponse({ error: 'Unhandled interaction type' }, { status: 400 });
});

const COMMAND_HANDLERS = {
  register: handleRegister,
  'report-score': handleReportScore,
  'my-match': handleMyMatch,
  tournament: handleTournament,
  'start-tournament': handleStartTournament,
  'force-match-winner': handleForceMatchWinner,
  'undo-match-result': handleUndoMatchResult,
  'next-round': handleNextRound,
  'to-add': handleToAdd,
  'to-remove': handleToRemove,
  rules: handleRules,
  help: handleHelp,
  'cancel-tournament': handleCancelTournament,
  history: handleHistory,
  tournaments: handleTournaments,
};



const server = {
  async fetch(request, env, ctx) {
    try {
      const response = await router.fetch(request, env, ctx);
      if (response) return response;
      return new Response('Not Found', { status: 404 });
    } catch (err) {
      console.error('Fetch error:', err);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};

export default server;
export { ALL_COMMANDS };
