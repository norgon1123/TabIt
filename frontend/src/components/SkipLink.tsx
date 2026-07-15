/** The first thing in the tab order: a link that jumps a keyboard/screen-reader user past
 *  the header straight to the page content. Off-screen until focused (see .skip-link), so it
 *  costs a sighted user nothing and a keyboard user one Tab. */
export default function SkipLink() {
  return (
    <a className="skip-link" href="#main-content">
      Skip to content
    </a>
  );
}
