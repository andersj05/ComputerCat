import { useId } from "react";
import catImage from "../../../assets/computer_cat.png";

/** Animate the original transparent artwork in place; the boots stay planted. */
export function PetArtwork() {
  const id = useId();
  return (
    <svg className="pet-art" viewBox="0 0 1024 1536" aria-hidden="true">
      <defs>
        <clipPath id={`${id}-body`}>
          <path d="M0 742H1024V1536H0Z" />
        </clipPath>
        <clipPath id={`${id}-head`}>
          <path d="M0 0H1024V765H0Z" />
        </clipPath>
      </defs>
      <g className="cat-body">
        <image href={catImage} width="1024" height="1536" clipPath={`url(#${id}-body)`} />
      </g>
      <g className="cat-head">
        <image href={catImage} width="1024" height="1536" clipPath={`url(#${id}-head)`} />
        <g className="cat-blink">
          <path
            fill="#efbd73"
            d="M398 507H412V489H439V478H476V489H490V509H504V565H490V590H424V578H410V552H398Z M628 515H641V499H657V488H699V499H714V515H729V563H714V589H648V576H635V550H628Z"
          />
          <path
            fill="none"
            stroke="#75452c"
            strokeWidth="12"
            d="M413 547L439 558H478L496 547 M640 550L661 561H700L721 550"
          />
        </g>
      </g>
    </svg>
  );
}
