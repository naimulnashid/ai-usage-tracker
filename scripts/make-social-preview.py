"""Draw the repository's GitHub social preview.

Run: python scripts/make-social-preview.py  ->  .github/social-preview.png

GitHub wants 1280x640 (2:1) and under 1MB, and renders it small in a timeline,
so this is a headline and three words of detail rather than a screenshot. It is
generated rather than exported from a design tool so it can be regenerated when
the wording changes, and so it never contains a pixel of real usage data - the
privacy rules at the top of CLAUDE.md apply to an image as much as to a commit.

Type is Geist, taken from the `geist` package this app already depends on, so
the card and the dashboard are set in the same face. Colours are the tokens
from globals.css and the bar shades from src/app/icon.svg, which encode the
same thing they do everywhere else: darker = more expensive.

Deliberately NOT on the card: either vendor's logo. The agent marks are used
nominatively inside the app to say which dashboard you are looking at. A
promotional card is a different kind of use, and naming the two agents in text
says the same thing without implying either company endorsed this.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "node_modules" / "geist" / "dist" / "fonts"
OUT = ROOT / ".github" / "social-preview.png"

W, H = 1280, 640
MARGIN = 84  # keeps everything clear of the rounded corners GitHub applies

BG = "#000000"
SURFACE = "#0a0a0c"
BORDER = "#1e1e24"
TEXT = "#fafafa"
MUTED = "#9a9aa4"
FAINT = "#7d7d87"

CLAUDE = "#d97757"
CODEX = "#10a37f"
# The icon's three bars, cheapest to dearest.
BARS = ["#f0a184", "#d97757", "#a4502f"]


def font(family: str, name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / family / name), size)


def rounded(draw: ImageDraw.ImageDraw, box, radius: int, **kw) -> None:
    draw.rounded_rectangle(box, radius=radius, **kw)


def mark(draw: ImageDraw.ImageDraw, x: int, y: int, size: int) -> None:
    """The favicon's three ascending bars, at `size` px square.

    Geometry is icon.svg's, scaled: a 32-unit box, bars 6 wide with 3-unit
    gaps. Keep the proportions if you redraw either - they are what let the
    same mark stay legible at 16px in a tab strip.
    """
    u = size / 32
    rounded(draw, (x, y, x + size, y + size), int(7 * u), fill=BG, outline=BORDER, width=max(1, int(u)))
    for (bx, by, bh), colour in zip(((4, 19, 8), (13, 12, 15), (22, 6, 21)), BARS):
        rounded(
            draw,
            (x + bx * u, y + by * u, x + (bx + 6) * u, y + (by + bh) * u),
            max(2, int(1.8 * u)),
            fill=colour,
        )


def dot_label(draw, x, y, colour, text, f) -> int:
    """A legend dot and its label. Returns the x the next one can start at."""
    r = 7
    cy = y + (f.size // 2) + 1
    draw.ellipse((x, cy - r, x + 2 * r, cy + r), fill=colour)
    draw.text((x + 2 * r + 13, y), text, font=f, fill=MUTED)
    return x + 2 * r + 13 + int(draw.textlength(text, font=f)) + 44


def spark(draw: ImageDraw.ImageDraw) -> None:
    """A daily-spend sparkline along the bottom right, as the product's own
    shorthand. Values are invented and deliberately unlabelled: a social card
    carrying real figures would break the privacy rule this repo runs on."""
    # Capped so the tallest bar clears the text block on its left: the copy
    # runs to roughly x=900, and these start at x=760, so a taller ramp would
    # grow up beside a line rather than under it.
    heights = [16, 30, 24, 46, 39, 63, 56, 85, 74, 106, 95, 129, 117, 148]
    bw, gap = 20, 12
    right = W - MARGIN
    base = H - MARGIN - 4
    x = right - (len(heights) * bw + (len(heights) - 1) * gap)
    for i, h in enumerate(heights):
        # The last two bars pick up the Codex accent: one dashboard, two agents.
        colour = CODEX if i >= len(heights) - 2 else BARS[min(i * 3 // len(heights), 2)]
        rounded(draw, (x, base - h, x + bw, base), 5, fill=colour)
        x += bw + gap


def main() -> None:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    # A panel edge along the top, so the card reads as a surface rather than a
    # void when a timeline puts it on a white background.
    d.rectangle((0, 0, W, 3), fill=SURFACE)
    d.rectangle((0, 3, W, 4), fill=BORDER)

    wordmark = font("geist-mono", "GeistMono-Medium.ttf", 30)
    h1 = font("geist-sans", "Geist-SemiBold.ttf", 68)
    sub = font("geist-sans", "Geist-Regular.ttf", 27)
    chip = font("geist-sans", "Geist-Medium.ttf", 23)
    foot = font("geist-mono", "GeistMono-Regular.ttf", 20)

    # The vertical rhythm is explicit rather than cumulative: every row is
    # placed from a named y, so moving one does not silently shunt the rest
    # into each other. The footer and the legend row did exactly that.
    mark(d, MARGIN, MARGIN, 56)
    d.text((MARGIN + 56 + 22, MARGIN + 12), "ai-usage-tracker", font=wordmark, fill=TEXT)

    d.text((MARGIN, 188), "Where your agents’", font=h1, fill=TEXT)
    d.text((MARGIN, 270), "tokens actually went.", font=h1, fill=TEXT)

    d.text(
        (MARGIN, 382),
        "A local-only dashboard for Claude Code and Codex. Tokens,",
        font=sub,
        fill=MUTED,
    )
    d.text(
        (MARGIN, 422),
        "estimated cost and runtime — read from the transcripts",
        font=sub,
        fill=MUTED,
    )
    d.text((MARGIN, 462), "already on your disk.", font=sub, fill=MUTED)

    spark(d)

    nx = dot_label(d, MARGIN, 528, CLAUDE, "Claude Code", chip)
    dot_label(d, nx, 528, CODEX, "Codex", chip)
    d.text((MARGIN, 566), "no database  ·  no telemetry  ·  MIT", font=foot, fill=FAINT)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "PNG", optimize=True)
    print(f"{OUT.relative_to(ROOT)}  {img.size[0]}x{img.size[1]}  {OUT.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
