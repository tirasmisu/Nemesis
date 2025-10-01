const logger = require('./logger');
const { EmbedBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

class RoleAuditor {
    constructor() {
        this.timedRolesPath = path.join(__dirname, '../data/timedRoles.json');
        this.noRoleNames = ['No VCs', 'No Tickets', 'No Memes', 'No Media', 'No General'];
        this.muteRoleNames = ['Muted', 'Timeout'];
    }

    async auditAllRoles(client, guildId) {
        try {
            const guild = await client.guilds.fetch(guildId);
            if (!guild) {
                await logger.error('ROLE_AUDITOR', 'Guild not found for auditing', { guildId });
                return;
            }

            await logger.system('ROLE_AUDITOR', 'Starting comprehensive role audit', { guildId });

            const muteResults = await this.auditMutedRoles(client, guild);
            const noRoleResults = await this.auditNoRoles(guild);
            await this.generateAuditReport(guild, muteResults, noRoleResults);

        } catch (error) {
            await logger.error('ROLE_AUDITOR', 'Error during role audit', error);
        }
    }

    async auditMutedRoles(client, guild) {
        const results = {
            checked: 0,
            removed: 0,
            kept: 0,
            errors: 0,
            removedUsers: []
        };

        try {
            const mutedRoles = guild.roles.cache.filter(role => 
                this.muteRoleNames.some(name => role.name.toLowerCase().includes(name.toLowerCase()))
            );

            if (mutedRoles.size === 0) {
                await logger.warn('ROLE_AUDITOR', 'No muted roles found in guild');
                return results;
            }

            await logger.system('ROLE_AUDITOR', `Found ${mutedRoles.size} muted role(s)`, {
                roles: mutedRoles.map(r => r.name)
            });

            for (const [roleId, role] of mutedRoles) {
                const membersWithRole = role.members;
                
                await logger.system('ROLE_AUDITOR', `Checking ${membersWithRole.size} members with role: ${role.name}`);

                for (const [memberId, member] of membersWithRole) {
                    results.checked++;

                    try {
                        const hasActiveMute = await this.checkActiveMute(client, memberId, guild.id);

                        if (!hasActiveMute) {
                            await member.roles.remove(role);
                            
                            results.removed++;
                            results.removedUsers.push({
                                userId: memberId,
                                username: member.user.username,
                                roleName: role.name
                            });

                            await logger.system('ROLE_AUDITOR', 'Removed expired muted role', {
                                userId: memberId,
                                username: member.user.username,
                                roleName: role.name
                            });
                        } else {
                            results.kept++;
                        }
                    } catch (error) {
                        results.errors++;
                        await logger.error('ROLE_AUDITOR', 'Error checking muted role for user', error, {
                            userId: memberId,
                            roleName: role.name
                        });
                    }
                }
            }

        } catch (error) {
            await logger.error('ROLE_AUDITOR', 'Error during muted role audit', error);
            results.errors++;
        }

        return results;
    }

    async auditNoRoles(guild) {
        const results = {
            checked: 0,
            removed: 0,
            kept: 0,
            errors: 0,
            removedUsers: []
        };

        try {
            const timedRolesData = await this.loadTimedRoles();
            const now = Date.now();

            const noRoles = guild.roles.cache.filter(role => 
                this.noRoleNames.some(name => role.name.toLowerCase().includes(name.toLowerCase()))
            );

            if (noRoles.size === 0) {
                await logger.warn('ROLE_AUDITOR', 'No temporary "no" roles found in guild');
                return results;
            }

            await logger.system('ROLE_AUDITOR', `Found ${noRoles.size} "no" role(s)`, {
                roles: noRoles.map(r => r.name)
            });

            for (const [roleId, role] of noRoles) {
                const membersWithRole = role.members;
                
                await logger.system('ROLE_AUDITOR', `Checking ${membersWithRole.size} members with role: ${role.name}`);

                for (const [memberId, member] of membersWithRole) {
                    results.checked++;

                    try {
                        const timedRole = timedRolesData.find(tr => 
                            tr.userId === memberId && 
                            tr.roleId === roleId && 
                            tr.guildId === guild.id
                        );

                        if (!timedRole) {
                            results.kept++;
                            await logger.warn('ROLE_AUDITOR', 'Found "no" role without timer data', {
                                userId: memberId,
                                username: member.user.username,
                                roleName: role.name
                            });
                        } else if (timedRole.endTime <= now) {
                            await member.roles.remove(role);
                            
                            results.removed++;
                            results.removedUsers.push({
                                userId: memberId,
                                username: member.user.username,
                                roleName: role.name,
                                expiredAt: new Date(timedRole.endTime).toISOString()
                            });

                            await logger.system('ROLE_AUDITOR', 'Removed expired "no" role', {
                                userId: memberId,
                                username: member.user.username,
                                roleName: role.name,
                                expiredAt: new Date(timedRole.endTime).toISOString()
                            });

                            const index = timedRolesData.findIndex(tr => 
                                tr.userId === memberId && 
                                tr.roleId === roleId && 
                                tr.guildId === guild.id
                            );
                            if (index !== -1) {
                                timedRolesData.splice(index, 1);
                            }
                        } else {
                            results.kept++;
                        }
                    } catch (error) {
                        results.errors++;
                        await logger.error('ROLE_AUDITOR', 'Error checking "no" role for user', error, {
                            userId: memberId,
                            roleName: role.name
                        });
                    }
                }
            }

            await this.saveTimedRoles(timedRolesData);

        } catch (error) {
            await logger.error('ROLE_AUDITOR', 'Error during "no" roles audit', error);
            results.errors++;
        }

        return results;
    }

    async checkActiveMute(client, userId, guildId) {
        try {
            if (!client.db) {
                return true;
            }

            const activeMute = await client.db.collection('mutes').findOne({
                userId: userId,
                guildId: guildId,
                active: true
            });

            if (!activeMute) {
                const moderationAction = await client.db.collection('moderationactions').findOne({
                    userId: userId,
                    guildId: guildId,
                    action: 'mute',
                    active: true
                });
                return !!moderationAction;
            }

            return !!activeMute;
        } catch (error) {
            await logger.error('ROLE_AUDITOR', 'Error checking active mute', error);
            return true;
        }
    }

    async loadTimedRoles() {
        try {
            const data = await fs.readFile(this.timedRolesPath, 'utf-8');
            return JSON.parse(data || '[]');
        } catch (error) {
            if (error.code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    async saveTimedRoles(data) {
        try {
            // Save to history file (append) to maintain all changes
            const historyFile = this.timedRolesPath.replace('.json', '_history.jsonl');
            const timestampedData = {
                timestamp: new Date().toISOString(),
                ...data
            };
            await fs.appendFile(historyFile, JSON.stringify(timestampedData) + '\n');
            
            // Write current state to main file (overwrite is intentional for current state)
            await fs.writeFile(this.timedRolesPath, JSON.stringify(data, null, 2));
            
            await logger.system('ROLE_AUDITOR', 'Timed roles data saved with history preserved');
        } catch (error) {
            await logger.error('ROLE_AUDITOR', 'Error saving timed roles data', error);
        }
    }

    async generateAuditReport(guild, muteResults, noRoleResults) {
        const totalChecked = muteResults.checked + noRoleResults.checked;
        const totalRemoved = muteResults.removed + noRoleResults.removed;
        const totalKept = muteResults.kept + noRoleResults.kept;
        const totalErrors = muteResults.errors + noRoleResults.errors;

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🔍 Role Audit Report')
            .setDescription(`**Guild:** ${guild.name}\n**Audit completed at:** ${new Date().toLocaleString()}`)
            .addFields(
                { 
                    name: '📊 Summary', 
                    value: `**Checked:** ${totalChecked}\n**Removed:** ${totalRemoved}\n**Kept:** ${totalKept}\n**Errors:** ${totalErrors}`, 
                    inline: true 
                },
                { 
                    name: '🔇 Muted Roles', 
                    value: `**Checked:** ${muteResults.checked}\n**Removed:** ${muteResults.removed}\n**Kept:** ${muteResults.kept}`, 
                    inline: true 
                },
                { 
                    name: '🚫 "No" Roles', 
                    value: `**Checked:** ${noRoleResults.checked}\n**Removed:** ${noRoleResults.removed}\n**Kept:** ${noRoleResults.kept}`, 
                    inline: true 
                }
            )
            .setTimestamp();

        const allRemovedUsers = [...muteResults.removedUsers, ...noRoleResults.removedUsers];
        if (allRemovedUsers.length > 0) {
            const removedList = allRemovedUsers
                .slice(0, 10)
                .map(user => `• ${user.username} - ${user.roleName}`)
                .join('\n');
                
            embed.addFields({
                name: '👥 Recently Removed Roles',
                value: removedList + (allRemovedUsers.length > 10 ? `\n... and ${allRemovedUsers.length - 10} more` : ''),
                inline: false
            });
        }

        await logger.system('ROLE_AUDITOR', 'Role audit completed', {
            guild: guild.name,
            summary: {
                totalChecked,
                totalRemoved,
                totalKept,
                totalErrors
            },
            removedUsers: allRemovedUsers
        });

        try {
            const channelConfig = require('../config/channels');
            const logChannelId = channelConfig.getId('MODERATION_LOG');
            const logChannel = guild.channels.cache.get(logChannelId);
            
            if (logChannel) {
                await logChannel.send({ embeds: [embed] });
            }
        } catch (error) {
            await logger.warn('ROLE_AUDITOR', 'Could not send audit report to moderation log', error);
        }
    }

    async runManualAudit(client, guildId) {
        await logger.system('ROLE_AUDITOR', 'Manual role audit triggered', { guildId });
        await this.auditAllRoles(client, guildId);
    }
}

module.exports = new RoleAuditor(); 
