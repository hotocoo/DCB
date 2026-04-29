#!/usr/bin/env python3
import re

with open('/home/runner/work/DCB/DCB/src/interactionHandlers.ts', 'r') as f:
    content = f.read()

# ===== FUNCTION SIGNATURES =====
replacements = [
    # sendWordleGuessModal
    ('export async function sendWordleGuessModal(interaction: ButtonInteraction, gameId: string): Promise<void> {',
     'export async function sendWordleGuessModal(interaction, gameId) {'),
    # updateInventoryEmbed
    ('export async function updateInventoryEmbed(interaction: ButtonInteraction, itemsByType: { [key: string]: any[] }, inventoryValue: number): Promise<void> {',
     'export async function updateInventoryEmbed(interaction, itemsByType, inventoryValue) {'),
    # checkCircuitBreaker
    ('function checkCircuitBreaker(interactionId: string): boolean {',
     'function checkCircuitBreaker(interactionId) {'),
    # recordErrorAttempt
    ('function recordErrorAttempt(interactionId: string): void {',
     'function recordErrorAttempt(interactionId) {'),
    # safeInteractionReply
    ('export async function safeInteractionReply(interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction, options: { content?: string; embeds?: EmbedBuilder[]; components?: ActionRowBuilder[]; flags?: MessageFlags }): Promise<boolean> {',
     'export async function safeInteractionReply(interaction, options) {'),
    # safeInteractionUpdate
    ('export async function safeInteractionUpdate(interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction, options: { content?: string | null; embeds?: EmbedBuilder[]; components?: ActionRowBuilder[]; flags?: MessageFlags }): Promise<boolean> {',
     'export async function safeInteractionUpdate(interaction, options) {'),
    # handleInteraction
    ('export async function handleInteraction(interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction, client: Client): Promise<void> {',
     'export async function handleInteraction(interaction, client) {'),
    # handleModalSubmit
    ('async function handleModalSubmit(interaction: ModalSubmitInteraction, client: Client): Promise<void> {',
     'async function handleModalSubmit(interaction, client) {'),
    # handleButtonInteraction
    ('export async function handleButtonInteraction(interaction: ButtonInteraction, client: Client): Promise<void> {',
     'export async function handleButtonInteraction(interaction, client) {'),

    # ===== VARIABLE TYPE ANNOTATIONS =====
    ('const interactionRateLimiter: RateLimiter = createRateLimiter(INTERACTION_RATE_LIMIT, INTERACTION_RATE_WINDOW, (key: string) => key);',
     'const interactionRateLimiter = createRateLimiter(INTERACTION_RATE_LIMIT, INTERACTION_RATE_WINDOW, (key) => key);'),
    ('const validationResult: ValidationResult = inputValidator.validateCommandInput(interaction);',
     'const validationResult = inputValidator.validateCommandInput(interaction);'),
    ('const validation: ValidationResult = inputValidator.validateCharacterClass(className);',
     'const validation = inputValidator.validateCharacterClass(className);'),
    ("let board: {name: string, lvl: number, xp: number, atk: number}[] = [], total = 0;",
     "let board = [], total = 0;"),
    ('const locations: { [key: string]: any } = getLocations();',
     'const locations = getLocations();'),
    ('let nextLocationId: string | null = null;',
     'let nextLocationId = null;'),
    ('const pathSegments: string[] = [];',
     'const pathSegments = [];'),

    # ===== TYPE CASTS =====
    # Two occurrences of (currentRow.components as any[]).map((button: any) => {
    ('(currentRow.components as any[]).map((button: any) => {',
     'currentRow.components.map((button) => {'),
    # locations[locId as keyof typeof locations]
    ('const location = locations[locId as keyof typeof locations];',
     'const location = locations[locId];'),
    # row.map with type annotation
    ('[row.map((r: ActionRowBuilder) => r.toJSON ? r.toJSON() : r)]',
     '[row.map((r) => r.toJSON ? r.toJSON() : r)]'),

    # ===== ARROW FUNCTION PARAM TYPES =====
    ('guesses.map((g: {number: number, feedback: string, attempt: number}, i: number) => ',
     'guesses.map((g, i) => '),
]

for old, new in replacements:
    if old in content:
        content = content.replace(old, new)
        print(f"OK: {old[:60]}")
    else:
        print(f"MISS: {old[:60]}")

# ===== CONSOLE CALLS =====

# 1. Remove the 3 DEBUG console.log lines at start of safeInteractionReply
old = "  console.log(`DEBUG: safeInteractionReply called with interaction: ${interaction.constructor.name}, interactionId: ${interactionId}`);\n  console.log(`DEBUG: interaction.user: ${interaction.user ? interaction.user.constructor.name : 'null'}, userId: ${interaction.user?.id}`);\n  console.log(`DEBUG: options type: ${typeof options}, options keys: ${Object.keys(options || {})}`);\n\n"
new = "\n"
if old in content:
    content = content.replace(old, new)
    print("OK: 3 debug console.logs in safeInteractionReply removed")
else:
    print("MISS: 3 debug console.logs in safeInteractionReply")

# 2. safeInteractionReply circuit breaker console.error (before logger.error)
old = "    console.error(`[SAFE_INTERACTION_REPLY] Circuit breaker tripped for interaction ${interactionId}, skipping reply`);\n    logger.error("
new = "    logger.error("
if old in content:
    content = content.replace(old, new)
    print("OK: safeInteractionReply circuit breaker console.error")
else:
    print("MISS: safeInteractionReply circuit breaker console.error")

# 3. safeInteractionReply already replied/deferred console.error (before logger.warn)
old = "      console.error(`[SAFE_INTERACTION_REPLY] Interaction ${interactionId} already replied/deferred`, {\n        userId: interaction.user.id,\n        interactionId,\n        replied: interaction.replied,\n        deferred: interaction.deferred\n      });\n      logger.warn("
new = "      logger.warn("
if old in content:
    content = content.replace(old, new)
    print("OK: safeInteractionReply already replied console.error")
else:
    print("MISS: safeInteractionReply already replied console.error")

# 4. safeInteractionReply attempting/success console.errors → logger.debug
old = "    console.error(`[SAFE_INTERACTION_REPLY] Attempting to reply to interaction ${interactionId}`);\n    await interaction.reply(options);\n    console.error(`[SAFE_INTERACTION_REPLY] Successfully replied to interaction ${interactionId}`);"
new = "    logger.debug(`Attempting to reply to interaction ${interactionId}`);\n    await interaction.reply(options);\n    logger.debug(`Successfully replied to interaction ${interactionId}`);"
if old in content:
    content = content.replace(old, new)
    print("OK: safeInteractionReply attempt/success console.errors")
else:
    print("MISS: safeInteractionReply attempt/success console.errors")

# 5. safeInteractionUpdate circuit breaker console.error (before logger.error)
old = "    console.error(`[SAFE_INTERACTION_UPDATE] Circuit breaker tripped for interaction ${interactionId}, skipping update`);\n    logger.error("
new = "    logger.error("
if old in content:
    content = content.replace(old, new)
    print("OK: safeInteractionUpdate circuit breaker console.error")
else:
    print("MISS: safeInteractionUpdate circuit breaker console.error")

# 6. handleInteraction error logging 3 console.errors → logger.error
old = (
    "    console.error('[HANDLE_INTERACTION] Error in handleInteraction:', error instanceof Error ? error.message : String(error));\n"
    "    console.error('[HANDLE_INTERACTION] Error stack:', error instanceof Error ? error.stack : undefined);\n"
    "    console.error('[HANDLE_INTERACTION] Interaction state at error:', {\n"
    "      id: interaction?.id,\n"
    "      replied: interaction?.replied,\n"
    "      deferred: interaction?.deferred,\n"
    "      type: interaction?.type,\n"
    "      command: interaction instanceof ChatInputCommandInteraction ? interaction.commandName : 'unknown',\n"
    "      userId: interaction?.user?.id\n"
    "    });\n"
)
new = (
    "    logger.error('[HANDLE_INTERACTION] Error in handleInteraction:', error instanceof Error ? error : new Error(String(error)), {\n"
    "      id: interaction?.id,\n"
    "      replied: interaction?.replied,\n"
    "      deferred: interaction?.deferred,\n"
    "      type: interaction?.type,\n"
    "      command: interaction instanceof ChatInputCommandInteraction ? interaction.commandName : 'unknown',\n"
    "      userId: interaction?.user?.id\n"
    "    });\n"
)
if old in content:
    content = content.replace(old, new)
    print("OK: handleInteraction 3 console.errors")
else:
    print("MISS: handleInteraction 3 console.errors")

# 7. handleButtonInteraction 4 debug console.logs
old = (
    "  console.log(`DEBUG: handleButtonInteraction called with interaction: ${interaction.constructor.name}, customId: ${interaction.customId}`);\n"
    "  console.log(`DEBUG: userId: ${userId}, buttonCooldownType: ${buttonCooldownType}`);\n"
    "  console.log(`DEBUG: interaction.user: ${interaction.user ? interaction.user.constructor.name : 'null'}`);\n"
    "  console.log(`DEBUG: interaction.message: ${interaction.message ? interaction.message.constructor.name : 'null'}`);\n\n"
)
new = "\n"
if old in content:
    content = content.replace(old, new)
    print("OK: handleButtonInteraction 4 debug console.logs")
else:
    print("MISS: handleButtonInteraction 4 debug console.logs")

# 8. handleModalSubmit debug console.log for reset confirmation
old = "      console.log(`DEBUG: Modal submit - reset confirmation for user ${interaction.user.id}, mode: ${mode}`);\n"
new = "      logger.debug(`Modal submit - reset confirmation for user ${interaction.user.id}, mode: ${mode}`);\n"
if old in content:
    content = content.replace(old, new)
    print("OK: handleModalSubmit reset debug console.log")
else:
    print("MISS: handleModalSubmit reset debug console.log")

# 9. guess_submit debug console.logs
old = "      console.log(`DEBUG: Processing guess_submit for gameId: ${gameId}`);\n"
new = "      logger.debug(`Processing guess_submit for gameId: ${gameId}`);\n"
if old in content:
    content = content.replace(old, new)
    print("OK: guess_submit debug console.log 1")
else:
    print("MISS: guess_submit debug console.log 1")

old = "      console.log(`DEBUG: Game state found: ${!!gameState}, gameState type: ${typeof gameState}`);\n"
new = "      logger.debug(`Game state found: ${!!gameState}, gameState type: ${typeof gameState}`);\n"
if old in content:
    content = content.replace(old, new)
    print("OK: guess_submit debug console.log 2")
else:
    print("MISS: guess_submit debug console.log 2")

old = "      console.log(`DEBUG: Retrieved guess input: ${guess}, type: ${typeof guess}`);\n"
new = "      logger.debug(`Retrieved guess input: ${guess}, type: ${typeof guess}`);\n"
if old in content:
    content = content.replace(old, new)
    print("OK: guess_submit debug console.log 3")
else:
    print("MISS: guess_submit debug console.log 3")

# 10. music_play MUSIC_PLAY_BUTTON console.errors → logger.warn
old = (
    "          console.error('[MUSIC_PLAY_BUTTON] Interaction already handled, cannot reply', {\n"
    "            interactionId: interaction.id,\n"
    "            replied: interaction.replied,\n"
    "            deferred: interaction.deferred\n"
    "          });\n"
)
new = (
    "          logger.warn('Interaction already handled, cannot reply', {\n"
    "            interactionId: interaction.id,\n"
    "            replied: interaction.replied,\n"
    "            deferred: interaction.deferred\n"
    "          });\n"
)
if old in content:
    content = content.replace(old, new)
    print("OK: music_play MUSIC_PLAY_BUTTON console.error")
else:
    print("MISS: music_play MUSIC_PLAY_BUTTON console.error")

old = (
    "          console.error('[MUSIC_PLAY_BUTTON_ERROR] Interaction already handled, cannot reply', {\n"
    "            interactionId: interaction.id,\n"
    "            replied: interaction.replied,\n"
    "            deferred: interaction.deferred\n"
    "          });\n"
)
new = (
    "          logger.warn('Interaction already handled, cannot reply', {\n"
    "            interactionId: interaction.id,\n"
    "            replied: interaction.replied,\n"
    "            deferred: interaction.deferred\n"
    "          });\n"
)
if old in content:
    content = content.replace(old, new)
    print("OK: music_play MUSIC_PLAY_BUTTON_ERROR console.error")
else:
    print("MISS: music_play MUSIC_PLAY_BUTTON_ERROR console.error")

# 11. trivia console.warn
old = "          console.warn('Failed to update trivia achievements:', error instanceof Error ? error.message : String(error));\n"
new = "          logger.warn('Failed to update trivia achievements:', { error: error instanceof Error ? error.message : String(error) });\n"
if old in content:
    content = content.replace(old, new)
    print("OK: trivia console.warn")
else:
    print("MISS: trivia console.warn")

with open('/home/runner/work/DCB/DCB/src/interactionHandlers.js', 'w') as f:
    f.write(content)

print("\nConversion complete!")

# Verify no console.* calls remain
import re
console_matches = re.findall(r'console\.(log|error|warn)\(', content)
if console_matches:
    print(f"\nWARNING: {len(console_matches)} console.* calls still remain!")
    # Find context of each
    for m in re.finditer(r'console\.(log|error|warn)\(', content):
        start = max(0, m.start() - 50)
        print(f"  ... {content[start:m.end()+50]!r}")
else:
    print("\nAll console.* calls successfully converted!")

# Verify no TS type annotations remain in function signatures
ts_patterns = [': Promise<', ': boolean {', ': void {', ': string {', ': ChatInputCommand', ': ButtonInteraction', ': ModalSubmit']
for pat in ts_patterns:
    if pat in content:
        idx = content.find(pat)
        print(f"\nWARNING: TypeScript pattern still found: {pat!r}")
        print(f"  Context: {content[max(0,idx-30):idx+60]!r}")
    
