/**
 * Kuratierte Emoji-Liste fuer alle Eingabefelder — Composer, Kommentare, Chat.
 *
 * Bewusst eine feste Liste statt einer Emoji-Bibliothek: das spart ein Paket
 * von mehreren hundert Kilobyte fuer eine Auswahl, die ohnehin niemand
 * durchscrollt. Die Zeichen sind Unicode; wie sie aussehen, entscheidet das
 * Geraet — auf iPhone und Mac sind es Apples Emoji, auf Android Googles.
 */
export const EMOJIS = [
  "😀","😃","😄","😁","😆","😅","😂","🤣","🙂","🙃","😉","😊","😇","🥰","😍","🤩",
  "😘","😗","😚","😋","😛","😜","🤪","😝","🤗","🤭","🤔","🤨","😐","😶","😏","😌",
  "😔","😪","😴","😒","🙄","😬","🥱","😷","🤒","🤕","🤢","🤮","🥴","😵","🤯","🥶",
  "🥳","😎","🤓","🧐","😢","😭","😤","😠","😡","🤬","😳","🥺","😱","😨","😰","😥",
  "👍","👎","👏","🙌","🤝","🙏","💪","👋","✌️","🤞","🤟","🤙","👌","🤌","✋","👆",
  "👇","👈","👉","💥","🔥","✨","⭐","🌟","💫","💯","✅","❌","⚠️","❓","❗","💤",
  "❤️","🧡","💛","💚","💙","💜","🖤","🤍","💔","💕","💖","💝","💘","💗","🩷","💌",
  "🎉","🎊","🎁","🏆","🥇","🎯","🚀","💡","📌","🔗","📎","📷","🎥","🎵","🎶","📣",
  "☕","🍕","🍔","🍰","🎂","🍺","🥂","🍫","🍎","🌍","☀️","🌙","⚡","🌈","❄️","🌸",
  "🐶","🐱","🦊","🐻","🐼","🐨","🦁","🐯","🐸","🐵","🦄","🐝","🦋","🌿","🍀","🌵",
] as const;
