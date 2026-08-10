export interface UnicodeEmoji {
  id: string
  name: string
  value: string
}

const EMOJI_VALUES: ReadonlyArray<readonly [string, string]> = [
  ['grinning face', '😀'], ['grin', '😁'], ['joy', '😂'], ['smiling face with tears', '🥹'], ['smiley', '😃'], ['smile', '😄'], ['sweat smile', '😅'], ['laughing', '😆'],
  ['wink', '😉'], ['blush', '😊'], ['yum', '😋'], ['sunglasses', '😎'], ['heart eyes', '😍'], ['kissing heart', '😘'], ['kissing', '😗'], ['kissing smiling eyes', '😙'],
  ['slightly smiling face', '🙂'], ['upside down face', '🙃'], ['melting face', '🫠'], ['hugging face', '🤗'], ['thinking face', '🤔'], ['saluting face', '🫡'], ['neutral face', '😐'],
  ['unamused', '😒'], ['rolling eyes', '🙄'], ['grimacing', '😬'], ['relieved', '😌'], ['pensive', '😔'], ['sleepy', '😪'], ['sleeping', '😴'], ['mask', '😷'],
  ['nauseated face', '🤢'], ['hot face', '🥵'], ['cold face', '🥶'], ['woozy face', '🥴'], ['dizzy face', '😵'], ['exploding head', '🤯'], ['cowboy hat face', '🤠'], ['partying face', '🥳'],
  ['nerd face', '🤓'], ['confused', '😕'], ['worried', '😟'], ['open mouth', '😮'], ['astonished', '😲'], ['flushed', '😳'], ['pleading face', '🥺'], ['fearful', '😨'],
  ['weary', '😩'], ['tired face', '😫'], ['cry', '😢'], ['sob', '😭'], ['scream', '😱'], ['angry', '😠'], ['rage', '😡'], ['cursing face', '🤬'],
  ['smiling imp', '😈'], ['skull', '💀'], ['poop', '💩'], ['clown face', '🤡'], ['ghost', '👻'], ['alien', '👽'], ['robot', '🤖'], ['jack o lantern', '🎃'],
  ['red heart', '❤️'], ['orange heart', '🧡'], ['yellow heart', '💛'], ['green heart', '💚'], ['blue heart', '💙'], ['purple heart', '💜'], ['black heart', '🖤'], ['white heart', '🤍'],
  ['broken heart', '💔'], ['two hearts', '💕'], ['sparkling heart', '💖'], ['heart on fire', '❤️‍🔥'], ['heart hands', '🫶'], ['thumbs up', '👍'], ['thumbs down', '👎'], ['ok hand', '👌'],
  ['victory hand', '✌️'], ['crossed fingers', '🤞'], ['love you gesture', '🤟'], ['sign of the horns', '🤘'], ['call me hand', '🤙'], ['raised hand', '✋'], ['open hands', '👐'], ['palms up together', '🤲'],
  ['clap', '👏'], ['folded hands', '🙏'], ['handshake', '🤝'], ['writing hand', '✍️'], ['nail polish', '💅'], ['muscle', '💪'], ['point left', '👈'], ['point right', '👉'],
  ['point up', '☝️'], ['point down', '👇'], ['raised fist', '✊'], ['left facing fist', '🤛'], ['right facing fist', '🤜'], ['wave', '👋'], ['eyes', '👀'], ['eye', '👁️'],
  ['brain', '🧠'], ['tongue', '👅'], ['lips', '👄'], ['kiss mark', '💋'], ['baby', '👶'], ['man', '👨'], ['woman', '👩'], ['princess', '👸'],
  ['superhero', '🦸'], ['ninja', '🥷'], ['dog', '🐶'], ['cat', '🐱'], ['mouse', '🐭'], ['hamster', '🐹'], ['rabbit', '🐰'], ['fox', '🦊'],
  ['bear', '🐻'], ['panda', '🐼'], ['koala', '🐨'], ['tiger', '🐯'], ['lion', '🦁'], ['cow', '🐮'], ['pig', '🐷'], ['frog', '🐸'],
  ['monkey', '🐵'], ['chicken', '🐔'], ['penguin', '🐧'], ['bird', '🐦'], ['duck', '🦆'], ['eagle', '🦅'], ['owl', '🦉'], ['unicorn', '🦄'],
  ['bee', '🐝'], ['bug', '🐛'], ['butterfly', '🦋'], ['snail', '🐌'], ['ant', '🐜'], ['spider', '🕷️'], ['turtle', '🐢'], ['snake', '🐍'],
  ['octopus', '🐙'], ['fish', '🐟'], ['dolphin', '🐬'], ['whale', '🐳'], ['shark', '🦈'], ['dragon', '🐉'], ['sun', '☀️'], ['star', '⭐'],
  ['glowing star', '🌟'], ['sparkles', '✨'], ['fire', '🔥'], ['boom', '💥'], ['snowflake', '❄️'], ['rainbow', '🌈'], ['cloud', '☁️'], ['zap', '⚡'],
  ['droplet', '💧'], ['ocean wave', '🌊'], ['rose', '🌹'], ['sunflower', '🌻'], ['four leaf clover', '🍀'], ['cactus', '🌵'], ['seedling', '🌱'], ['tree', '🌳'],
  ['apple', '🍎'], ['green apple', '🍏'], ['pear', '🍐'], ['tangerine', '🍊'], ['lemon', '🍋'], ['banana', '🍌'], ['watermelon', '🍉'], ['grapes', '🍇'],
  ['strawberry', '🍓'], ['peach', '🍑'], ['pineapple', '🍍'], ['mango', '🥭'], ['coconut', '🥥'], ['avocado', '🥑'], ['tomato', '🍅'], ['corn', '🌽'],
  ['carrot', '🥕'], ['hot pepper', '🌶️'], ['hamburger', '🍔'], ['fries', '🍟'], ['pizza', '🍕'], ['taco', '🌮'], ['popcorn', '🍿'], ['ramen', '🍜'],
  ['spaghetti', '🍝'], ['sushi', '🍣'], ['cookie', '🍪'], ['birthday cake', '🎂'], ['cake', '🍰'], ['chocolate bar', '🍫'], ['candy', '🍬'], ['ice cream', '🍦'],
  ['beer', '🍺'], ['beers', '🍻'], ['wine glass', '🍷'], ['cocktail', '🍸'], ['coffee', '☕'], ['soccer', '⚽'], ['basketball', '🏀'], ['football', '🏈'],
  ['baseball', '⚾'], ['tennis', '🎾'], ['medal', '🏅'], ['trophy', '🏆'], ['car', '🚗'], ['taxi', '🚕'], ['bus', '🚌'], ['rocket', '🚀'],
  ['airplane', '✈️'], ['ship', '🚢'], ['house', '🏠'], ['watch', '⌚'], ['mobile phone', '📱'], ['computer', '💻'], ['camera', '📷'], ['light bulb', '💡'],
  ['money bag', '💰'], ['gem', '💎'], ['bomb', '💣'], ['speech balloon', '💬'], ['check mark', '✅'], ['cross mark', '❌'], ['question mark', '❓'], ['exclamation mark', '❗'],
  ['100', '💯'], ['warning', '⚠️'], ['recycle', '♻️'], ['infinity', '♾️']
]

function makeId(value: string): string {
  return Array.from(value)
    .map((character) => character.codePointAt(0)!.toString(16))
    .join('-')
}

const CATALOG: ReadonlyArray<UnicodeEmoji> = Object.freeze(
  EMOJI_VALUES.map(([name, value]) => ({ id: makeId(value), name, value }))
)

export function getUnicodeEmojiCatalog(): ReadonlyArray<UnicodeEmoji> {
  return CATALOG
}
