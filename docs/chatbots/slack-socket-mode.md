# Slack Socket Mode Integration

PySpur provides integration with Slack's Socket Mode, allowing you to receive events and trigger workflows in real-time without exposing a public URL.

## What is Socket Mode?

Socket Mode establishes a WebSocket connection between your Slack app and PySpur, allowing Slack to send events directly over this connection rather than via HTTP webhooks. This is especially useful for:

- Local development environments
- Environments behind firewalls
- Testing Slack integrations without a public URL
- Avoiding the need to set up and manage an HTTPS endpoint

## Requirements

To use Socket Mode with PySpur, you need:

1. A Slack app with Socket Mode enabled
2. The Slack app's signing secret
3. A bot token with the `connections:write` scope
4. PySpur configured with the required environment variables

## Setup Instructions

### 1. Create a Slack App

If you haven't already, create a Slack app at [api.slack.com/apps](https://api.slack.com/apps).

### 2. Enable Socket Mode

1. In your Slack app settings, navigate to **Socket Mode**
2. Toggle "Enable Socket Mode" to on
3. Click "Save Changes"

### 3. Add Required Scopes

Go to **OAuth & Permissions** and add the following scopes:

- `connections:write` (required for Socket Mode)
- `chat:write` (to send messages)
- `channels:history` (to read channel messages)
- `im:history` (to read direct messages)
- `app_mentions:read` (to detect mentions)

### 4. Subscribe to Events

Go to **Event Subscriptions** and subscribe to the bot events:

- `message.im` (for direct messages)
- `message.channels` (for channel messages)
- `app_mention` (for @mentions)

### 5. Get Your Signing Secret

Go to **Basic Information** and copy your **Signing Secret**.

### 6. Configure PySpur

Add the following environment variables to your PySpur instance:

```
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_SIGNING_SECRET=your-signing-secret-here
```

## Using Socket Mode in PySpur

1. Create a Slack agent in PySpur
2. Configure the agent with your bot token
3. Go to the Socket Mode tab in the agent details
4. Click "Start" to initiate the Socket Mode connection
5. The connection status will show as "Active" when connected

When events occur in Slack (mentions, messages, etc.), they will be forwarded to PySpur through the WebSocket connection and trigger your configured workflows.

## Troubleshooting

### Connection Issues

- Verify your SLACK_SIGNING_SECRET is correctly configured
- Ensure your bot token has the `connections:write` scope
- Check that Socket Mode is enabled in your Slack app settings

### Events Not Triggering

- Verify the agent's trigger settings (mentions, direct messages, etc.)
- Ensure the agent is associated with a workflow
- Check that the agent's trigger is enabled

## Limitations

- Socket Mode connections may occasionally disconnect and need to be restarted
- For production environments with high reliability requirements, the HTTP Events API may be more appropriate

## Recommended Practice

Use Socket Mode for development and testing, and switch to the HTTP Events API for production deployments where possible.