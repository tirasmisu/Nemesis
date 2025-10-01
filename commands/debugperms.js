const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { BaseCommand } = require('../utils/commandTemplate');
const { checkModerationPermission } = require('../utils/commandHelpers');

class DebugPermsCommand extends BaseCommand {
    constructor() {
        super(
            new SlashCommandBuilder()
                .setName('debugperms')
                .setDescription('Admin-only: Debug permission issues with roles')
                .addStringOption(option =>
                    option.setName('target')
                    .setDescription('The target role type to check')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Helpers', value: 'helpers' },
                        { name: 'Mods', value: 'mods' },
                        { name: 'Senior Mods', value: 'seniormods' },
                        { name: 'Admins', value: 'admins' }
                    )
                )
        );
    }

    shouldDeferReply() {
        return true;
    }

    isEphemeral() {
        return true;
    }

    async validateInput(interaction) {
        // Only allow Admins to use this command
        if (!await checkModerationPermission(interaction, 'admin')) {
            await interaction.reply({
                content: 'This command is only available to Administrators.',
                flags: ['Ephemeral']
            });
            return false;
        }
        
        return true;
    }

    async executeCommand(interaction) {
        const targetRole = interaction.options.getString('target');
        const guild = interaction.guild;
        
        // Get all members with roles and filter based on the target role
        await guild.members.fetch();
        
        const targetRoleMap = {
            'helpers': ['Helpers', 'Helper'],
            'mods': ['Mods', 'Mod', 'Moderator', 'Moderators'],
            'seniormods': ['Senior Mods', 'Senior Mod', 'Sr Mods', 'Sr Mod', 'SrMods', 'SrMod'],
            'admins': ['Admin', 'Admins', 'Administrator', 'Administrators']
        };
        
        const matchingRoles = guild.roles.cache.filter(role => 
            targetRoleMap[targetRole].some(name => 
                role.name.toLowerCase() === name.toLowerCase()
            )
        );
        
        // Get members with any of these roles
        const membersWithRole = guild.members.cache.filter(member => 
            member.roles.cache.some(role => 
                matchingRoles.has(role.id)
            )
        );
        
        return {
            targetRole,
            matchingRoles: Array.from(matchingRoles.values()).map(r => ({ id: r.id, name: r.name })),
            members: Array.from(membersWithRole.values()).map(m => ({ 
                id: m.id, 
                tag: m.user.tag,
                roles: m.roles.cache.map(r => r.name).join(', ')
            }))
        };
    }

    async sendResponse(interaction, result) {
        const { targetRole, matchingRoles, members } = result;
        
        if (matchingRoles.length === 0) {
            await interaction.editReply({
                content: `No roles found matching ${targetRole} role type.`
            });
            return;
        }
        
        // Create an embed for the results
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle(`Role Permission Debug: ${targetRole}`)
            .setDescription(`Found ${matchingRoles.length} roles and ${members.length} members`)
            .addFields(
                { 
                    name: 'Matching Roles', 
                    value: matchingRoles.map(r => `${r.name} (${r.id})`).join('\n') || 'None', 
                    inline: false 
                }
            );
            
        // Add fields for each member (limit to 10 to avoid embed size limit)
        const displayMembers = members.slice(0, 10);
        
        if (displayMembers.length > 0) {
            for (const member of displayMembers) {
                embed.addFields({
                    name: member.tag,
                    value: `ID: ${member.id}\nRoles: ${member.roles.length > 100 ? member.roles.substring(0, 100) + '...' : member.roles}`,
                    inline: false
                });
            }
            
            if (members.length > 10) {
                embed.setFooter({ text: `Showing 10 of ${members.length} members` });
            }
        } else {
            embed.addFields({
                name: 'Members',
                value: 'No members found with this role type',
                inline: false
            });
        }
        
        await interaction.editReply({
            embeds: [embed]
        });
    }

    async execute(interaction) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ flags: ['Ephemeral'] });
            }
            const validation = await this.validateInput(interaction);
            if (!validation) return;
            const result = await this.executeCommand(interaction);
            await this.sendResponse(interaction, result);
        } catch (error) {
            if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({ content: 'An error occurred while processing your request.' });
            } else if (!interaction.replied) {
                await interaction.reply({ content: 'An error occurred while processing your request.', flags: ['Ephemeral'] });
            }
        }
    }
}

module.exports = new DebugPermsCommand(); 
