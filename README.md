# Nemesis

Nemesis is your all-seeing guardian for Discord moderation. With smart automation, deep database logging, and autofill convenience, Nemesis keeps your community safe, fair, and organized so staff can focus on the people, not the paperwork.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Setup and Installation](#setup-and-installation)
- [Command Structure](#command-structure)
- [Commands](#commands)
  - [General Commands](#general-commands)
  - [Moderation Commands](#moderation-commands)
  - [Utility Commands](#utility-commands)
  - [Admin Commands](#admin-commands)
- [Context Menu Commands](#context-menu-commands)
- [Permission System](#permission-system)
- [Configuration](#configuration)
- [Services](#services)
- [Utilities](#utilities)
- [Data Persistence](#data-persistence)
- [Events System](#events-system)
- [Databases](#databases)
- [Key Features](#key-features)
- [Development](#development)

## Overview

Nemesis is a Discord bot built with discord.js that provides robust moderation tools, logging capabilities, and utility functions for server administrators and moderators. The bot leverages slash commands, context menus, and a class-based architecture to provide a consistent, maintainable codebase.

Key capabilities include:
- Full moderation suite (ban, kick, mute, warn, etc.)
- Discord server event scheduling with timezone support
- Advanced XP and leveling system with voice channel support
- Comprehensive logging system with multiple log channels
- Automatic role management and voice channel creation
- Customizable configurations and permission systems
- Context menu translation service using Google Translate API
- Interactive voice channel invitation and join request systems
- Ticket system with DM-based support
- Analytics and performance monitoring
- Message filtering and content moderation
- Compromise detection and security features

## Architecture

The bot is organized into the following directory structure:

```
Nemesis/
├── commands/           # Command implementations (56 files)
├── contextMenus/       # Context menu commands (5 files)
├── config/             # Configuration files
│   ├── channels.js     # Channel ID configuration
│   ├── roles.js        # Role hierarchy and permissions
│   └── voiceChannels.js # Voice channel settings
├── events/             # Event handlers (18 files)
├── services/           # Business logic services (6 files)
├── utils/              # Utility functions (36 files)
├── models/             # Database models (4 files)
├── data/               # Local data storage
├── scripts/            # Deployment and utility scripts (14 files)
├── guildCommands/      # Guild-specific commands (3 files)
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

### General Commands

| Command | Description | Usage | Permission |
|---------|-------------|-------|------------|
| `help` | Display available commands with categories | `/help [category]` | Everyone |
| `ping` | Check bot latency and status | `/ping` | Everyone |
| `userinfo` | Display detailed user information | `/userinfo [user]` | Everyone |
| `avatar` | Display a user's avatar | `/avatar [user]` | Everyone |
| `staffguide` | Show staff guidelines and procedures | `/staffguide` | Everyone |
| `status` | View bot system status and health | `/status` | Everyone |
| `changelog` | View recent changes and updates | `/changelog` | Everyone |
| `rank` | View your XP rank or another user's rank | `/rank [user]` | Everyone |
| `level` | View your current level and XP progress | `/level [user]` | Everyone |
| `leaderboard` | View the server XP leaderboard | `/leaderboard [limit]` | Everyone |
| `invite` | Invite a user to your voice channel | `/invite user:<@user>` | Nitro Boosters/Staff |
| `requestjoin` | Request to join someone's voice channel | `/requestjoin user:<@user>` | Everyone |
| `nickname` | Request a nickname change | `/nickname name:<text>` | Everyone |
| `translate` | Translate text | `/translate text:<text> target:<language>` | Everyone |
| `network` | Check network connectivity and status | `/network` | Everyone |

### Moderation Commands

| Command | Description | Usage | Permission |
|---------|-------------|-------|------------|
| `ban` | Ban a user from the server | `/ban user:<@user> reason:<text>` | Mods+ |
| `blacklistword` | Add a word to the blacklist | `/blacklistword word:<text>` | Mods+ |
| `closeticket` | Close and archive a ticket | `/closeticket` | Helpers+ |
| `kick` | Kick a user from the server | `/kick user:<@user> reason:<text>` | Mods+ |
| `lock` | Lock a channel | `/lock channel:<#channel>` | Mods+ |
| `mute` | Mute a user for a specified duration | `/mute user:<@user> duration:<text> reason:<text>` | Helpers+ |
| `purge` | Delete a number of messages | `/purge amount:<number>` | Mods+ |
| `purgeuser` | Delete messages from a specific user | `/purgeuser user:<@user> amount:<number>` | Mods+ |
| `reasonedit` | Edit punishment reason | `/reasonedit id:<text> reason:<text>` | Helpers+ |
| `removepunishment` | Remove a punishment | `/removepunishment id:<text>` | Mods+ |
| `unban` | Unban a user | `/unban user:<@user>` | Mods+ |
| `unblacklistword` | Remove a word from the blacklist | `/unblacklistword word:<text>` | Mods+ |
| `unmute` | Unmute a user | `/unmute user:<@user>` | Helpers+ |
| `warn` | Warn a user | `/warn user:<@user> reason:<text> notify:<boolean>` | Helpers+ |

### Utility Commands

| Command | Description | Usage | Permission |
|---------|-------------|-------|------------|
| `modview` | View a user's moderation history | `/modview user:<@user>` | Helpers+ |
| `disconnect` | Disconnect a user from voice channel | `/disconnect user:<@user> reason:<text>` | Mods+ |
| `helpstaff` | Show all available staff commands | `/helpstaff` | Helpers+ |
| `ooo` | Toggle Out of Office role on/off for staff | `/ooo` | Helpers+ |
| `sendblacklist` | DM the current blacklist to yourself | `/sendblacklist` | Helpers+ |
| `sendwhitelist` | View the current whitelist with pagination | `/sendwhitelist [page]` | Senior Mods+ |
| `whitelistword` | Add a word to the whitelist to bypass blacklist filtering | `/whitelistword word:<text> [reason]` | Senior Mods+ |
| `unwhitelistword` | Remove a word from the whitelist | `/unwhitelistword word:<text>` | Senior Mods+ |
| `testerror` | Test error handling system | `/testerror` | Admins+ |

### Admin Commands

| Command | Description | Usage | Permission |
|---------|-------------|-------|------------|
| `addrole` | Add a role to a user | `/addrole user:<@user> role:<@role>` | Mods+ |
| `removerole` | Remove a role from a user | `/removerole user:<@user> role:<@role>` | Mods+ |
| `say` | Make the bot say something | `/say message:<text> channel:<#channel>` | Admins+ |
| `sayembed` | Send an embed message | `/sayembed title:<text> description:<text> color:<hex>` | Admins+ |
| `setnick` | Set a user's nickname | `/setnick user:<@user> nickname:<text>` | Admins+ |
| `staffview` | View all actions by a staff member | `/staffview user:<@user>` | Senior Mods+ |
| `updatecount` | Update count for tracking | `/updatecount type:<text> count:<number>` | Admins+ |
| `analytics` | View comprehensive server analytics | `/analytics [type]` | Admins+ |
| `status` | View bot system status and performance | `/status [type]` | Admins+ |
| `debugperms` | Debug permission system for troubleshooting | `/debugperms user:<@user>` | Admins+ |
| `checkmute` | Check if a user is currently muted | `/checkmute user:<@user>` | Admins+ |
| `cleanupexpiredmutes` | Clean up expired mutes from database | `/cleanupexpiredmutes` | Admins+ |
| `auditroles` | Audit and display server roles information | `/auditroles` | Admins+ |
| `setlevel` | Set a user's XP level | `/setlevel user:<@user> level:<number>` | Admins+ |
| `resetlevel` | Reset a user's XP level to 0 | `/resetlevel user:<@user>` | Admins+ |
| `importxp` | Import XP data from external sources | `/importxp file:<attachment>` | Admins+ |
| `databaseremove` | Remove data from database collections | `/databaseremove collection:<text> query:<text>` | Admins+ |
| `createevent` | Create a Discord scheduled event | `/createevent name:<text> description:<text> date:<YYYY-MM-DD or YYYY/MM/DD> time:<HH:MM> timezone:<selection> duration:<text> location:<selection>` | Senior Mods+ or Event Hosts |

## Context Menu Commands

| Command | Description | Usage | Permission |
|---------|-------------|-------|------------|
| `Translate Message` | Translate a message to English | Right-click on message > Apps > Translate Message | Everyone |
| `Add Reaction with Bot` | Add reactions to a message using the bot | Right-click on message > Apps > Add Reaction with Bot | Admins+ |
| `Reply with Bot` | Reply to a message as the bot | Right-click on message > Apps > Reply with Bot | Admins+ |
| `Invite to Voice Channel` | Invite a user to your voice channel | Right-click on user > Apps > Invite to Voice Channel | Nitro Boosters/Staff |
| `Request to Join Voice Channel` | Request to join someone's voice channel | Right-click on user > Apps > Request to Join Voice Channel | Everyone |

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

## Services

Nemesis includes several service modules that power its functionality:

- **`xpService.js`**: XP and leveling system with voice channel support
- **`voiceChannelService.js`**: Join to Create voice channels and management
- **`invitationService.js`**: Voice channel invitation system
- **`joinRequestService.js`**: Voice channel join request system
- **`moderationActionService.js`**: Moderation action tracking and management
- **`compromiseDetection.js`**: Security and compromise detection

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
- **Database Models**: ModerationAction, BlacklistedWord, TicketData, NicknameRequest, UserXP  
- **Local Files**: blacklist.json, nicknameCooldowns.json, activeTickets.json, command_usage.json  

## Events System

Nemesis uses an event-driven architecture to handle messages, member joins, interactions, and more. Events include:
- `messageCreate`
- `guildMemberAdd`
- `interactionCreate`
- `voiceStateUpdate`
- And many more for comprehensive logging and functionality

## Databases

Nemesis leverages MongoDB with schemas for:
- Moderation Actions  
- Blacklisted Words  
- Ticket Data  
- Nickname Requests  
- User XP and Leveling

## Key Features

- Moderation logging with unique IDs  
- DM-based ticket system  
- Timed actions (mutes, bans, roles)  
- Standardized user notifications  
- Robust error handling  
- XP and leveling system with voice channel support
- Context menu translation service using Google Translate API
- Interactive voice channel invitation and join request systems
- Analytics and performance monitoring
- Message filtering and content moderation
- Compromise detection and security features

## Development

### Adding New Commands

1. Create a new file in `commands/`
2. Extend `BaseCommand` or `ModerationCommand`
3. Implement required methods
4. Check permissions & logging
5. Test before submission

---

© 2025 Nemesis | Made with ❤️ and discord.js