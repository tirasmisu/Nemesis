# Nemesis

Nemesis is your all-seeing guardian for Discord moderation. With smart automation, deep database logging, and autofill convenience, Nemesis keeps your community safe, fair, and organized so staff can focus on the people, not the paperwork.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Setup and Installation](#setup-and-installation)
- [Command Structure](#command-structure)
- [Commands](#commands)
  - [Moderation Commands](#moderation-commands)
  - [Utility Commands](#utility-commands)
  - [Admin Commands](#admin-commands)
  - [Event Commands](#event-commands)
- [Permission System](#permission-system)
- [Configuration](#configuration)
- [Utilities](#utilities)
- [Data Persistence](#data-persistence)
- [Events System](#events-system)
- [Databases](#databases)
- [Key Features](#key-features)
- [Development](#development)

## Overview

Nemesis is a Discord bot built with discord.js that provides robust moderation tools, logging capabilities, and utility functions for server administrators and moderators. The bot leverages slash commands and a class-based architecture to provide a consistent, maintainable codebase.

Key capabilities include:
- Full moderation suite (ban, kick, mute, warn, etc.)
- Discord server event scheduling with timezone support
- Logging actions to designated channels
- Automatic role management
- Ticket system
- Customizable configurations
- Context menu translation service

## Architecture

The bot is organized into the following directory structure:

```
Nemesis/
├── commands/           # Command implementations
├── guildCommands/      # Guild-specific commands
├── contextMenus/       # Context menu commands
├── config/             # Configuration files
├── events/             # Event handlers
├── helpers/            # Helper functions
├── models/             # Database models
├── services/           # Business logic services
├── utils/              # Utility functions
├── data/               # Local data storage
├── scripts/            # Deployment and utility scripts
├── index.js            # Application entry point
└── package.json        # Dependencies
```

The bot follows a class-based architecture for commands, with standardized imports, error handling, and logging. Each command follows a consistent structure to ensure maintainability.

## Setup and Installation

1. Clone the repository
2. Install dependencies: `npm install`
3. Create a `.env` file with the following variables:
   ```
   TOKEN=your_discord_bot_token
   CLIENT_ID=your_discord_client_id
   GUILD_ID=your_guild_id (optional for guild-specific commands)
   MONGODB_URI=your_mongodb_connection_string
   ```
4. Deploy commands: `npm run global` or `node scripts/deploy-commands.js`
5. Run the bot: `npm run start` or `node index.js`

## Command Structure

All commands follow a standardized template found in `utils/commandTemplate.js` with the following structure:

### BaseCommand Class
- Basic command with validation, execution, response, and logging
- Methods that can be overridden:
  - `shouldDeferReply()` - Whether to defer the interaction response
  - `isEphemeral()` - Whether the response should be ephemeral
  - `validateInput()` - Validate command inputs
  - `executeCommand()` - Execute the command's main logic
  - `sendResponse()` - Send response to the user
  - `shouldLogAction()` - Whether this action should be logged
  - `logAction()` - Log the action to a channel

### ModerationCommand Class
- Extends BaseCommand with additional moderation-specific functionality
- Adds standardized moderation logging
- Automatically handles permission checks

## Commands

### Moderation Commands

| Command | Description | Usage | Permission |
|---------|-------------|-------|------------|
| `ban` | Ban a user from the server | `/ban user:<@user> reason:<text>` | Mods+ |
| `blacklistword` | Add a word to blacklist | `/blacklistword word:<text>` | Mods+ |
| `closeticket` | Close and archive a ticket | `/closeticket` | Helpers+ |
| `kick` | Kick a user from the server | `/kick user:<@user> reason:<text>` | Mods+ |
| `lock` | Lock a channel | `/lock channel:<#channel>` | Mods+ |
| `mute` | Mute a user for a specified duration | `/mute user:<@user> duration:<text> reason:<text>` | Helpers+ |
| `purge` | Delete a number of messages | `/purge amount:<number>` | Mods+ |
| `purgeuser` | Delete messages from a specific user | `/purgeuser user:<@user> amount:<number>` | Mods+ |
| `reasonedit` | Edit punishment reason | `/reasonedit id:<text> reason:<text>` | Helpers+ |
| `removepunishment` | Remove a punishment | `/removepunishment id:<text>` | Mods+ |
| `unban` | Unban a user | `/unban user:<@user>` | Mods+ |
| `unblacklistword` | Remove a word from blacklist | `/unblacklistword word:<text>` | Mods+ |
| `unmute` | Unmute a user | `/unmute user:<@user>` | Helpers+ |
| `warn` | Warn a user | `/warn user:<@user> reason:<text> notify:<boolean>` | Helpers+ |

### Utility Commands

| Command | Description | Usage | Permission |
|---------|-------------|-------|------------|
| `avatar` | Display a user's avatar | `/avatar user:<@user>` | Everyone |
| `modview` | View a user's moderation history | `/modview user:<@user>` | Helpers+ |
| `nickname` | Request a nickname change | `/nickname name:<text>` | Everyone |
| `ping` | Check bot latency | `/ping` | Everyone |
| `staffguide` | Show staff guidelines | `/staffguide` | Everyone |
| `translate` | Translate text | `/translate text:<text> target:<language>` | Everyone |
| `userinfo` | Display user information | `/userinfo user:<@user>` | Everyone |

### Admin Commands

| Command | Description | Usage | Permission |
|---------|-------------|-------|------------|
| `addrole` | Add a role to a user | `/addrole user:<@user> role:<@role>` | Mods+ |
| `removerole` | Remove a role from a user | `/removerole user:<@user> role:<@role>` | Mods+ |
| `say` | Make the bot say something | `/say message:<text> channel:<#channel>` | Admins+ |
| `setnick` | Set a user's nickname | `/setnick user:<@user> nickname:<text>` | Admins+ |
| `setupnickrequest` | Setup nickname request system | `/setupnickrequest channel:<#channel>` | Admins+ |
| `setupticket` | Setup the ticket system | `/setupticket channel:<#channel>` | Admins+ |
| `staffview` | View all actions by a staff member | `/staffview user:<@user>` | Senior Mods+ |
| `updatecount` | Update count for tracking | `/updatecount type:<text> count:<number>` | Admins+ |

### Event Commands

| Command | Description | Usage | Permission |
|---------|-------------|-------|------------|
| `createevent` | Create a Discord scheduled event | `/createevent name:<text> description:<text> date:<YYYY-MM-DD or YYYY/MM/DD> time:<HH:MM> timezone:<selection> duration:<text> location:<selection>` | Senior Mods+ or Event Hosts |

### Context Menu Commands

| Command | Description | Usage | Permission |
|---------|-------------|-------|------------|
| `Translate Message` | Translate a message to English | Right-click on a message > Apps > Translate Message | Everyone |

## Permission System

Nemesis uses a hierarchical permission system defined in `utils/commandHelpers.js`:

1. **Everyone**: All server members
2. **Helpers**: Entry-level moderation team
3. **Mods**: Full moderators with additional permissions
4. **Senior Mods**: Senior moderators with oversight capabilities
5. **Admin**: Server administrators with full control

Permissions are checked using the `checkModerationPermission()` and `checkTargetHierarchy()` functions to ensure staff can only moderate users of lower rank.

## Configuration

The central configuration system is managed through the `config/channels.js` file. This ensures consistency, maintainability, validation, and type safety across all channel IDs and settings.

## Utilities

Nemesis includes various utility modules that power its functionality:
- **Command Helpers**: standardized command execution functions  
- **Error Management**: centralized error handling  
- **Translation System**: slash commands + context menus  
- **Event Scheduling System**: create/manage events with timezone support  
- **Mute Management**: timed mutes/unmutes  
- **Role Management**: timed roles, role utilities  
- **System Monitoring**: bot health checks, error logging  

## Data Persistence

Nemesis uses MongoDB for database storage and local JSON files for critical time-sensitive data.  
- **Database Models**: ModerationAction, BlacklistedWord, TicketData, NicknameRequest  
- **Local Files**: blacklist.json, nicknameCooldowns.json, timedRoles.json  

## Events System

Nemesis uses an event-driven architecture to handle messages, member joins, interactions, and more. Events include:
- `messageCreate`
- `guildMemberAdd`
- `interactionCreate`

## Databases

Nemesis leverages MongoDB with schemas for:
- Moderation Actions  
- Blacklisted Words  
- Ticket Data  
- Nickname Requests  

## Key Features

- Moderation logging with unique IDs  
- DM-based ticket system  
- Timed actions (mutes, bans, roles)  
- Standardized user notifications  
- Robust error handling  

## Development

### Adding New Commands

1. Create a new file in `commands/`
2. Extend `BaseCommand` or `ModerationCommand`
3. Implement required methods
4. Check permissions & logging
5. Test before submission

---

© 2025 Nemesis | Made with ❤️ and discord.js
