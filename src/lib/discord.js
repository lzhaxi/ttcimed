import { InteractionResponseType } from 'discord-interactions';

export const EPHEMERAL = 64;

export class JsonResponse extends Response {
  constructor(body, init) {
    super(JSON.stringify(body), {
      ...init,
      headers: {
        'content-type': 'application/json;charset=UTF-8',
        ...(init?.headers ?? {}),
      },
    });
  }
}

export function ephemeral(content) {
  return new JsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content, flags: EPHEMERAL },
  });
}



export function defer(ephemeralReply = false) {
  return new JsonResponse({
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: { flags: ephemeralReply ? EPHEMERAL : 0 },
  });
}

export async function editReply(env, interaction, data) {
  const url = `https://discord.com/api/v10/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}/messages/@original`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${env.DISCORD_TOKEN}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    console.error('editReply failed:', res.status);
  }
  return res;
}

export async function sendFollowup(env, interaction, data) {
  const url = `https://discord.com/api/v10/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${env.DISCORD_TOKEN}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('sendFollowup failed:', res.status, text);
  }
  return res;
}

// direct channel message to avoid ephemeral reply chaining
export async function sendChannelMessage(env, interaction, data) {
  return fetch(`https://discord.com/api/v10/channels/${interaction.channel_id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bot ${env.DISCORD_TOKEN}` },
    body: JSON.stringify(data),
  });
}

// update the original ephemeral "thinking" message to a success state since we can't delete ephemeral messages
export async function resolveEphemeral(env, interaction, message = 'Done') {
  return editReply(env, interaction, { content: message });
}

export function getOption(interaction, name) {
  return interaction.data.options?.find((o) => o.name === name)?.value;
}

export function getUser(interaction) {
  return interaction.member?.user ?? interaction.user;
}

export function userError(code) {
  const messages = {
    MATCH_NOT_FOUND: 'No pending match found with that opponent.',
    ALREADY_REPORTED: 'This match has already been reported.',
    NOT_YOUR_MATCH: 'You are not a participant in this match.',
    BYE_MATCH: 'You have a bye this round — no match to report.',
    DRAW_NOT_ALLOWED: 'Draws are not allowed. Enter a decisive score.',
    ALREADY_PENDING: 'This match is already pending.',
    NO_AUDIT_LOG: 'Cannot undo — no audit record found.',
    INVALID_WINNER: 'Winner must be one of the match participants.',
    TOURNAMENT_NOT_FOUND: 'No active tournament found.',
    NOT_REGISTERED: 'You are not registered for this tournament.',
    REGISTRATION_CLOSED: 'Registration is closed.',
    REGISTRATION_OPEN: 'Registration is still open.',
    MIN_PLAYERS: 'At least 9 players are required to start.',
    ROUND_INCOMPLETE: 'All matches in the current round must be resolved first.',
    UNAUTHORIZED: 'You do not have permission to run this command.',
    NO_TOURNAMENT: 'No active tournament in this server.',
    ALREADY_REGISTERED: 'You are already registered.',
    SWISS_COMPLETE: 'Swiss rounds are complete.',
    TOP_CUT_COMPLETE: 'Top cut is complete.',
  };
  if (messages[code]) return messages[code];

  // If the code is uppercase snake_case, it's an unmapped internal error code.
  if (typeof code === 'string' && /^[A-Z_]+$/.test(code)) {
    return 'Something went wrong. Please try again or contact a TO.';
  }

  // Otherwise, it might be a literal string passed directly, or an unhandled SQL error.
  return code ?? 'Something went wrong. Please try again or contact a TO.';
}
