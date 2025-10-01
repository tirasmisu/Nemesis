const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { importFromArcane } = require('../services/xpService');
const { BaseCommand } = require('../utils/commandTemplate');
const fs = require('fs').promises;
const path = require('path');

class ImportXPCommand extends BaseCommand {
    constructor() {
        super(new SlashCommandBuilder()
            .setName('importxp')
            .setDescription('Import XP data from Arcane bot')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Only admins can use
            .addAttachmentOption(option => 
                option.setName('file')
                    .setDescription('JSON file exported from Arcane bot')
                    .setRequired(true))
        );
    }

    shouldDeferReply() {
        return true;
    }

    isEphemeral() {
        return true;
    }

    async validateInput(interaction) {
        const file = interaction.options.getAttachment('file');
        
        // Validate file type
        if (!file.name.endsWith('.json')) {
            throw new Error('Please upload a JSON file.');
        }
        
        // Validate file size (max 10 MB)
        if (file.size > 10 * 1024 * 1024) {
            throw new Error('File is too large. Maximum size is 10 MB.');
        }
        
        return { file };
    }

    async executeCommand(interaction) {
        const { file } = await this.validateInput(interaction);
        
        try {
            // Create directory for uploads if it doesn't exist
            const uploadsDir = path.join(__dirname, '../data/uploads');
            await fs.mkdir(uploadsDir, { recursive: true });
            
            // Download the file
            const filePath = path.join(uploadsDir, `${Date.now()}-${file.name}`);
            const response = await fetch(file.url);
            const buffer = await response.arrayBuffer();
            await fs.writeFile(filePath, Buffer.from(buffer));
            
            // Import the data
            const results = await importFromArcane(filePath, interaction.guild.id);
            
            // Delete the file after processing
            await fs.unlink(filePath).catch(() => {});
            
            return { 
                results,
                fileName: file.name
            };
        } catch (error) {
            console.error('[ImportXP] Error importing XP data:', error);
            throw new Error(`Failed to import XP data: ${error.message}`);
        }
    }

    async sendResponse(interaction, { results, fileName }) {
        // Create embed with import results
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('XP Import Complete')
            .setDescription(`Successfully imported XP data from ${fileName}`)
            .addFields(
                { name: 'Total Users', value: results.total.toString(), inline: true },
                { name: 'Successful Imports', value: results.success.toString(), inline: true },
                { name: 'Skipped', value: results.skipped.toString(), inline: true },
                { name: 'Errors', value: results.errors.toString(), inline: true }
            )
            .setTimestamp();
        
        await interaction.followUp({ embeds: [embed], flags: ['Ephemeral'] });
    }
}

module.exports = new ImportXPCommand(); 
