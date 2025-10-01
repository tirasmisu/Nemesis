const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const ModerationAction = require('../models/ModerationAction');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('checkmute')
        .setDescription('Check a user\'s mute status in the database (debug)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to check')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
        
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        const user = interaction.options.getUser('user');
        
        try {
            const activeMute = await ModerationAction.findOne({
                userId: user.id,
                action: 'mute',
                active: true
            });
            
            if (!activeMute) {
                await interaction.editReply(`❌ No active mute found for ${user.tag}`);
                return;
            }
            
            const ms = require('ms');
            const isPermanent = !activeMute.duration || activeMute.duration.toLowerCase() === 'forever' || activeMute.duration.toLowerCase() === 'permanent';
            
            let endTime, isExpired, timeRemaining;
            
            if (isPermanent) {
                endTime = 'Never (Permanent)';
                isExpired = false;
                timeRemaining = 'Permanent';
            } else {
                const durationMs = ms(activeMute.duration);
                if (durationMs) {
                    const endTimeMs = new Date(activeMute.timestamp).getTime() + durationMs;
                    endTime = new Date(endTimeMs).toISOString();
                    isExpired = Date.now() >= endTimeMs;
                    timeRemaining = isExpired ? 'EXPIRED' : ms(endTimeMs - Date.now());
                } else {
                    endTime = 'Invalid duration format';
                    isExpired = false;
                    timeRemaining = 'Unknown';
                }
            }
            
            await interaction.editReply({
                content: `🔍 **Mute Status for ${user.tag}:**
                
**Action ID:** ${activeMute.actionId}
**Duration:** ${activeMute.duration}
**Timestamp:** ${activeMute.timestamp}
**End Time:** ${endTime}
**Current Time:** ${new Date().toISOString()}
**Is Expired:** ${isExpired ? '✅ YES' : '❌ NO'}
**Time Remaining:** ${timeRemaining}
**Active in DB:** ${activeMute.active}
**Reason:** ${activeMute.reason}`
            });
            
        } catch (error) {
            console.error('Error checking mute:', error);
            await interaction.editReply('❌ Error checking mute status');
        }
    }
}; 