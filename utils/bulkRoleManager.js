const { EmbedBuilder } = require('discord.js');
const { createProgressIndicator } = require('./interactionHelpers');
const { createAuditLog, ACTION_TYPES } = require('./auditLogger');
const logger = require('./logger');

// Bulk add roles
async function bulkAddRoles(client, interaction, options) {
    const {
        roleId,
        userIds,
        reason,
        skipErrors = false
    } = options;
    
    try {
        const guild = interaction.guild;
        const role = await guild.roles.fetch(roleId);
        
        if (!role) {
            throw new Error('Role not found');
        }
        
        // Create progress indicator
        const progress = await createProgressIndicator(interaction, {
            title: 'Bulk Role Addition',
            description: `Adding role ${role.name} to ${userIds.length} users...`,
            totalSteps: userIds.length
        });
        
        const results = {
            success: [],
            failed: []
        };
        
        // Process users in batches
        const batchSize = 10;
        for (let i = 0; i < userIds.length; i += batchSize) {
            const batch = userIds.slice(i, i + batchSize);
            const batchPromises = batch.map(async (userId) => {
                try {
                    const member = await guild.members.fetch(userId);
                    await member.roles.add(role);
                    results.success.push(userId);
                } catch (error) {
                    results.failed.push({ userId, error: error.message });
                    if (!skipErrors) {
                        throw error;
                    }
                }
            });
            
            await Promise.all(batchPromises);
            await progress.updateProgress(i + batch.length, `Processed ${i + batch.length} of ${userIds.length} users`);
        }
        
        // Create result embed
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Bulk Role Addition Complete')
            .addFields(
                { name: 'Role', value: role.toString(), inline: true },
                { name: 'Total Users', value: userIds.length.toString(), inline: true },
                { name: 'Successful', value: results.success.length.toString(), inline: true },
                { name: 'Failed', value: results.failed.length.toString(), inline: true }
            );
        
        if (results.failed.length > 0) {
            embed.addFields({
                name: 'Failed Users',
                value: results.failed.map(f => `<@${f.userId}>: ${f.error}`).join('\n')
            });
        }
        
        await progress.complete('Role addition completed');
        await interaction.followUp({ embeds: [embed] });
        
        // Create audit log
        await createAuditLog(client, {
            type: ACTION_TYPES.ROLE,
            action: 'bulk_role_add',
            targetId: null,
            executorId: interaction.user.id,
            reason,
            details: {
                roleId,
                totalUsers: userIds.length,
                successful: results.success.length,
                failed: results.failed.length
            },
            guildId: guild.id
        });
        
        return results;
    } catch (error) {
        await logger.error('BULK_ROLE_MANAGER', 'Error in bulk add roles', error);
        throw error;
    }
}

// Bulk remove roles
async function bulkRemoveRoles(client, interaction, options) {
    const {
        roleId,
        userIds,
        reason,
        skipErrors = false
    } = options;
    
    try {
        const guild = interaction.guild;
        const role = await guild.roles.fetch(roleId);
        
        if (!role) {
            throw new Error('Role not found');
        }
        
        // Create progress indicator
        const progress = await createProgressIndicator(interaction, {
            title: 'Bulk Role Removal',
            description: `Removing role ${role.name} from ${userIds.length} users...`,
            totalSteps: userIds.length
        });
        
        const results = {
            success: [],
            failed: []
        };
        
        // Process users in batches
        const batchSize = 10;
        for (let i = 0; i < userIds.length; i += batchSize) {
            const batch = userIds.slice(i, i + batchSize);
            const batchPromises = batch.map(async (userId) => {
                try {
                    const member = await guild.members.fetch(userId);
                    await member.roles.remove(role);
                    results.success.push(userId);
                } catch (error) {
                    results.failed.push({ userId, error: error.message });
                    if (!skipErrors) {
                        throw error;
                    }
                }
            });
            
            await Promise.all(batchPromises);
            await progress.updateProgress(i + batch.length, `Processed ${i + batch.length} of ${userIds.length} users`);
        }
        
        // Create result embed
        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('Bulk Role Removal Complete')
            .addFields(
                { name: 'Role', value: role.toString(), inline: true },
                { name: 'Total Users', value: userIds.length.toString(), inline: true },
                { name: 'Successful', value: results.success.length.toString(), inline: true },
                { name: 'Failed', value: results.failed.length.toString(), inline: true }
            );
        
        if (results.failed.length > 0) {
            embed.addFields({
                name: 'Failed Users',
                value: results.failed.map(f => `<@${f.userId}>: ${f.error}`).join('\n')
            });
        }
        
        await progress.complete('Role removal completed');
        await interaction.followUp({ embeds: [embed] });
        
        // Create audit log
        await createAuditLog(client, {
            type: ACTION_TYPES.ROLE,
            action: 'bulk_role_remove',
            targetId: null,
            executorId: interaction.user.id,
            reason,
            details: {
                roleId,
                totalUsers: userIds.length,
                successful: results.success.length,
                failed: results.failed.length
            },
            guildId: guild.id
        });
        
        return results;
    } catch (error) {
        await logger.error('BULK_ROLE_MANAGER', 'Error in bulk remove roles', error);
        throw error;
    }
}

// Get users with role
async function getUsersWithRole(guild, roleId) {
    try {
        const role = await guild.roles.fetch(roleId);
        if (!role) {
            throw new Error('Role not found');
        }
        
        return role.members.map(member => member.id);
    } catch (error) {
        await logger.error('BULK_ROLE_MANAGER', 'Error getting users with role', error);
        throw error;
    }
}

// Get users without role
async function getUsersWithoutRole(guild, roleId) {
    try {
        const role = await guild.roles.fetch(roleId);
        if (!role) {
            throw new Error('Role not found');
        }
        
        const members = await guild.members.fetch();
        return members.filter(member => !member.roles.cache.has(roleId)).map(member => member.id);
    } catch (error) {
        await logger.error('BULK_ROLE_MANAGER', 'Error getting users without role', error);
        throw error;
    }
}

module.exports = {
    bulkAddRoles,
    bulkRemoveRoles,
    getUsersWithRole,
    getUsersWithoutRole
}; 
