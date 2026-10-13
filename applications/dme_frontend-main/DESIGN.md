# DME Frontend Design System

## Foundation

The interface follows Orange Boosted 5.3.7 and Orange Brand Basics. It uses a restrained product register with square geometry, no decorative shadows, and a black, white, and Orange core palette.

## Color

- Orange action: `#ff7900`
- Orange active: `#f16e00`
- Black: `#000000`
- White: `#ffffff`
- Gray surface: `#eeeeee`
- Gray border: `#cccccc`
- Secondary text: `#595959`
- Error: `#cd3c14`
- Success: `#228722`

Orange identifies primary actions, current state, and focus. Black provides structure. Status never relies on color alone.

## Typography

Use the Orange Boosted stack: Helvetica Neue, Helvetica, Noto Sans, Liberation Sans, Arial, and system fallbacks. UI text uses a compact fixed scale with 16px body text and bold headings.

## Components

Inputs have visible labels, square corners, black borders, and an explicit Orange focus outline. Primary buttons use Orange with black text. Secondary buttons use black with white text. Loading, disabled, error, hover, active, and focus-visible states are required.

## Layout

Authentication uses a split desktop composition with a black context panel and a white task panel. It collapses to a single-column layout on small screens. Content width is capped for readability.

## Motion

Transitions last 150–200ms and communicate state only. Reduced-motion preferences remove transforms and animated transitions.
