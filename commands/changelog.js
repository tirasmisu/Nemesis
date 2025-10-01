const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// Command framework
const { BaseCommand } = require('../utils/commandTemplate');

// Helpers & services
const { checkModerationPermission } = require('../utils/commandHelpers');

// Role configuration for ID-based checking
const roleConfig = require('../config/roles');

class ChangelogCommand extends BaseCommand {
    constructor() {
        super(
            new SlashCommandBuilder()
                .setName('changelog')
                .setDescription('View recent bot updates and changes relevant to your role')
        );
    }

    shouldDeferReply() {
        return false;
    }

    isEphemeral() {
        return true;
    }

    async validateInput(interaction) {
        try {
            const hasPermission = await checkModerationPermission(interaction, 'helpers');
            if (!hasPermission) {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ 
                        content: 'You do not have permission to use this command.',
                        flags: ['Ephemeral']
                    });
                }
                return false;
            }
            return {};
        } catch (error) {
            console.error('[CHANGELOG] Error in validation:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: 'An error occurred while validating this command. The error has been logged.',
                    flags: ['Ephemeral']
                });
            }
            return false;
        }
    }

    async executeCommand(interaction) {
        const { user, member } = interaction;
        let userRole = 'helpers';
        let roleColor = 0x00ff99;
        let roleTitle = 'Helper';

        // Use ID-based role checking for security and reliability
        if (roleConfig.memberHasRole(member, 'T') || roleConfig.memberHasRole(member, 'ADMINS')) {
            userRole = 'admins';
            roleColor = 0xe67e22;
            roleTitle = 'Admin';
        } else if (roleConfig.memberHasRole(member, 'SENIOR_MODERATORS')) {
            userRole = 'seniorMods';
            roleColor = 0x8e44ad;
            roleTitle = 'Senior Moderator';
        } else if (roleConfig.memberHasRole(member, 'MODERATORS')) {
            userRole = 'mods';
            roleColor = 0xff5555;
            roleTitle = 'Moderator';
        }

        const embed = new EmbedBuilder()
            .setColor(roleColor)
            .setTitle(`📋 TraniumBot V5 - Recent Changes`)
            .setDescription(`Recent updates and improvements relevant to **${roleTitle}** staff:`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .setTimestamp();

        // Latest Version - Security & Response Time Update
        embed.addFields({
            name: '🚀 **Version 5.3 - Security & Response Enhancement** (Latest)',
            value: `**Major New Features:**
• **🛡️ Compromise Detection System** - Automatic detection and handling of compromised accounts
• **⚡ Instant Response Commands** - Public commands now respond immediately without delays
• **🔐 Enhanced Role Security** - ID-based role checking for improved security
• **🚨 Anti-Spam Protection** - Advanced link spam detection across multiple channels

**New Commands:**


**Security Improvements:**
• **Account Compromise Detection** - Automatically kicks users showing signs of compromise
• **Link Spam Monitoring** - Detects users posting links across multiple channels rapidly
• **Whitelisted Domains** - Safe domains (Discord, YouTube, etc.) bypass detection
• **Staff Protection** - Staff members are exempt from auto-moderation actions`
        });

        // Previous Version
        embed.addFields({
            name: '📈 **Version 5.2 - Performance & Analytics Suite**',
            value: `**Features:**
• **Analytics Dashboard** - Track server engagement, command usage, and growth metrics
• **Memory Management** - Automatic optimization and monitoring system
• **Smart Cooldowns** - Non-restrictive command cooldowns with staff bypass
• **Event Channels** - YouTube-specific temporary channels for streams/premieres
• **Database Optimization** - Automatic query optimization and performance tracking

**Commands:** \`/analytics\`, \`/createevent\`, \`/status\`, \`/changelog\``
        });

        // Role-specific changes
        if (userRole === 'admins') {
            embed.addFields({
                name: '👑 **Admin-Specific Updates**',
                value: `• **🛡️ Compromise Detection Control** - Configure and monitor anti-compromise settings
• **📊 Security Analytics** - View compromise detection statistics and performance
• **⚙️ Detection Tuning** - Adjust channel thresholds and time windows
• **🚨 Real-time Monitoring** - Track compromise attempts and user kicks
• **Full Analytics Access** - Overview, commands, channels, growth, engagement views
• **Event Management** - Create channels for YouTube streams, premieres, and special events
• **System Monitoring** - Memory, database, and performance status tracking`
            });
        }

        if (userRole === 'seniorMods' || userRole === 'admins') {
            embed.addFields({
                name: '🛡️ **Senior Mod+ Updates**',
                value: `• **Enhanced Staff View** - More detailed moderation history tracking
• **Database Management** - Access to database removal tools for cleanup
• **Advanced Punishment Management** - Better tools for managing user records
• **Audit Logging** - Comprehensive action tracking and history`
            });
        }

        if (userRole === 'mods' || userRole === 'seniorMods' || userRole === 'admins') {
            embed.addFields({
                name: '⚖️ **Mod+ Updates**',
                value: `• **Improved Role Management** - Enhanced \`/addrole\` and \`/removerole\` commands
• **Better Purge System** - More reliable message deletion with user targeting
• **Enhanced Blacklist** - Improved word filtering and management
• **Nickname Tools** - Better nickname management with \`/setnick\`
• **Say Command** - Make announcements with \`/say\``
            });
        }

        // Helper and all staff updates
        embed.addFields({
            name: '🤝 **All Staff Updates**',
            value: `• **⚡ Instant Command Responses** - Public commands (avatar, level, userinfo) respond immediately
• **🛡️ Enhanced Security** - ID-based role checking prevents role spoofing
• **🚨 Compromise Protection** - Staff members are automatically exempt from spam detection
• **📋 Better Help System** - Updated \`/helpstaff\` with comprehensive command lists
• **🔧 Improved Error Handling** - Better error messages and reduced command failures
• **⚙️ Optimized Performance** - Faster command responses and better reliability
• **🎯 Smart Cooldowns** - Non-restrictive cooldowns that don't affect staff workflow`
        });

        // Bug fixes and improvements
        embed.addFields({
            name: '🔧 **Bug Fixes & Improvements**',
            value: `• **🚫 Interaction Errors Fixed** - Resolved "reply not sent or deferred" errors
• **📱 Command Response Issues** - Fixed avatar, level, userinfo, and nickname commands
• **⚡ Deferral Problems Resolved** - Public commands no longer unnecessarily defer

• **🛠️ Template Conflicts** - Resolved conflicting execute methods in commands
• **💾 Memory Management** - Automatic cleanup prevents bot slowdowns
• **🗃️ Database Optimization** - Faster queries and better performance`
        });

        // Future updates preview
        embed.addFields({
            name: '🔮 **Coming Soon**',
            value: `• **Advanced Moderation AI** - Smart detection of problematic content
• **Custom Command Builder** - Create server-specific commands
• **Enhanced Analytics** - More detailed insights and reporting
• **Mobile Dashboard** - Web interface for server management
• **Integration Tools** - Better YouTube and social media integration`
        });

        embed.setFooter({ 
            text: `TraniumBot V5.3 | Secured & Optimized for ${interaction.guild.name} | Role: ${roleTitle}` 
        });

        return { embed, user };
    }

    async sendResponse(interaction, { embed }) {
        if (interaction.deferred) {
            await interaction.editReply({ embeds: [embed] });
        } else {
            await interaction.reply({ embeds: [embed], flags: ['Ephemeral'] });
        }
    }


}

module.exports = new ChangelogCommand(); 
