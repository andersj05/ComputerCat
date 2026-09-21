import { useId, useLayoutEffect, useRef } from "react";
import catImage from "../../../assets/computer_cat.png";
import type { PetActivity } from "./pet-activity";
import "./pet-motion.css";

// Overlapping shoulder cuts retain the original pixels as the paws pivot inward.
const leftPaw = "M0 804H378V830H405V895H422V959H438V1027H456V1110H477V1210H0Z";
const rightPaw = "M730 796H1024V1210H648V1174H665V1076H673V1010H662V939H690V872H708V825H730Z";

/** A small SVG rig over the supplied artwork; no frame loop, asset swaps, or OS access. */
export function PetArtwork({
  activity = "idle",
  motionPaused = false,
}: {
  activity?: PetActivity;
  motionPaused?: boolean;
}) {
  const id = useId();
  const artwork = useRef<SVGSVGElement>(null);
  // CSS pauses repeating motion. Pose transitions also need to hold their current frame,
  // including when a new activity arrives while the cat is being dragged or hidden.
  useLayoutEffect(() => {
    if (!artwork.current || !activity) return;
    for (const motion of artwork.current.getAnimations({ subtree: true })) {
      if (!(motion instanceof CSSTransition)) continue;
      if (motionPaused) motion.pause();
      else if (motion.playState === "paused") motion.play();
    }
  }, [activity, motionPaused]);
  return (
    <svg
      ref={artwork}
      className="pet-art"
      data-activity={activity}
      viewBox="0 0 1024 1536"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`${id}-body`}>
          <path d={`M0 742H1024V1310H0Z ${leftPaw} ${rightPaw}`} clipRule="evenodd" />
        </clipPath>
        <clipPath id={`${id}-head`}>
          <path d="M0 0H1024V790H0Z" />
        </clipPath>
        <clipPath id={`${id}-boots`}>
          <path d="M0 1296H1024V1536H0Z" />
        </clipPath>
        <clipPath id={`${id}-left-paw`}>
          <path d={leftPaw} />
        </clipPath>
        <clipPath id={`${id}-right-paw`}>
          <path d={rightPaw} />
        </clipPath>
        <pattern
          id={`${id}-fur`}
          x="348"
          y="805"
          width="428"
          height="430"
          patternUnits="userSpaceOnUse"
          viewBox="464 774 196 150"
          preserveAspectRatio="none"
        >
          <image href={catImage} width="1024" height="1536" />
        </pattern>
      </defs>
      <image
        className="cat-boots"
        href={catImage}
        width="1024"
        height="1536"
        clipPath={`url(#${id}-boots)`}
      />
      <g className="cat-breathe">
        <g className="cat-body">
          <g className="cat-shoulders" shapeRendering="crispEdges">
            <path
              fill={`url(#${id}-fur)`}
              stroke="#45291e"
              strokeWidth="14"
              d="M377 812H744V872H738V960H728V1046H722V1110H735V1158H752V1180H772V1230H375V1180H392V1158H405V1110H411V1046H402V960H386V872H377Z"
            />
          </g>
          <image href={catImage} width="1024" height="1536" clipPath={`url(#${id}-body)`} />
          {activity === "transcribing" || activity === "review" ? (
            <g className="cat-notebook" shapeRendering="crispEdges">
              <path fill="#563d31" d="M453 932H696V1195H453Z" />
              <path fill="#ffffdf" d="M469 946H682V1180H469Z" />
              <path
                fill="#91add1"
                d="M490 990H657V1001H490Z M490 1031H635V1042H490Z M490 1072H651V1083H490Z M490 1113H615V1124H490Z"
              />
              <path stroke="#ad6250" strokeWidth="12" d="M500 930v34m43-34v34m43-34v34m43-34v34" />
              {activity === "review" && (
                <path fill="none" stroke="#378349" strokeWidth="17" d="m548 1120 24 24 50-58" />
              )}
            </g>
          ) : null}
          {activity === "working" && (
            <g className="cat-keyboard" shapeRendering="crispEdges">
              <path fill="#4e5266" d="M328 1100H796V1220H328Z" />
              <path fill="#e5e7ef" d="M343 1114H781V1203H343Z" />
              <path
                stroke="#7c87a0"
                strokeWidth="12"
                strokeDasharray="25 16"
                d="M360 1136h405m-405 28h405"
              />
              <path fill="#7c87a0" d="M480 1180H647V1192H480Z" />
            </g>
          )}
          <g className="cat-paw-pose cat-left-pose">
            <g className="cat-paw cat-paw-left">
              <image href={catImage} width="1024" height="1536" clipPath={`url(#${id}-left-paw)`} />
            </g>
          </g>
          <g className="cat-paw-pose cat-right-pose">
            <g className="cat-paw cat-paw-right">
              <image
                href={catImage}
                width="1024"
                height="1536"
                clipPath={`url(#${id}-right-paw)`}
              />
              {activity === "transcribing" && (
                <g className="cat-pencil" shapeRendering="crispEdges">
                  <path fill="#62442f" d="m701 1121 65-189 25 9-65 189-28 31Z" />
                  <path stroke="#f9dc63" strokeWidth="15" d="m715 1124 63-181" />
                  <path stroke="#ed9396" strokeWidth="21" d="m776 954 7-22" />
                </g>
              )}
            </g>
          </g>
        </g>
        <g className="cat-head-pose">
          <g className="cat-head">
            <image href={catImage} width="1024" height="1536" clipPath={`url(#${id}-head)`} />
            <g className="cat-blink cat-eye-left">
              <path
                fill="#efbd73"
                d="M398 507H412V489H439V478H476V489H490V509H504V565H490V590H424V578H410V552H398Z"
              />
              <path
                fill="none"
                stroke="#75452c"
                strokeWidth="12"
                d="M413 547L439 558H478L496 547"
              />
            </g>
            <g className="cat-blink cat-eye-right">
              <path
                fill="#efbd73"
                d="M628 515H641V499H657V488H699V499H714V515H729V563H714V589H648V576H635V550H628Z"
              />
              <path
                fill="none"
                stroke="#75452c"
                strokeWidth="12"
                d="M640 550L661 561H700L721 550"
              />
            </g>
            <g className="cat-mouth" shapeRendering="crispEdges">
              <path fill="#ffefd1" d="M514 682H606V708H619V734H591V744H529V734H501V708H514Z" />
              <g className="cat-mouth-open">
                <path fill="#62382f" d="M535 690H585V715H575V727H545V715H535Z" />
                <path fill="#e6a0a0" d="M547 712H573V724H547Z" />
              </g>
            </g>
          </g>
        </g>
      </g>
      <PetCue activity={activity} />
    </svg>
  );
}

/** Pixel props communicate the activity even when all motion is disabled. */
function PetCue({ activity }: { activity: PetActivity }) {
  if (activity === "idle" || activity === "transcribing" || activity === "working") return null;
  return (
    <g className="cat-cue" shapeRendering="crispEdges">
      <path fill="#694c38" d="M76 770H255V784H270V914H244V941H218V914H76V899H61V785H76Z" />
      <path fill="#fff9dd" d="M81 786H249V898H228V923H219V898H77V787Z" />
      {activity === "listening" && (
        <g fill="#3d8859">
          <path className="cat-signal cat-signal-one" d="M100 828H119V862H100Z" />
          <path className="cat-signal cat-signal-two" d="M138 811H157V880H138Z" />
          <path className="cat-signal cat-signal-three" d="M176 821H195V870H176Z" />
          <path className="cat-signal cat-signal-four" d="M214 833H233V858H214Z" />
        </g>
      )}
      {activity === "thinking" && (
        <g fill="#607dad">
          <path className="cat-thought cat-thought-one" d="M100 834H123V857H100Z" />
          <path className="cat-thought cat-thought-two" d="M153 834H176V857H153Z" />
          <path className="cat-thought cat-thought-three" d="M206 834H229V857H206Z" />
        </g>
      )}
      {activity === "preparing" && (
        <g className="cat-hourglass">
          <path
            fill="#826043"
            d="M126 802H206V816H194V833L179 845 194 857V875H206V889H126V875H138V857L153 845 138 833V816H126Z"
          />
          <path
            fill="#e5b344"
            d="M151 818H181V830L166 844 151 830Z M151 861L166 847 181 861V873H151Z"
          />
        </g>
      )}
      {activity === "replying" && (
        <g fill="#527cb0" className="cat-reply-lines">
          <path d="M99 816H229V829H99Z M99 842H205V855H99Z M99 868H182V881H99Z" />
        </g>
      )}
      {(activity === "review" || activity === "happy") && (
        <path
          className="cat-check"
          fill="none"
          stroke="#3d8859"
          strokeWidth="19"
          d="m112 841 33 32 73-65"
        />
      )}
      {activity === "stopping" && (
        <path fill="#97734b" d="M133 815H155V877H133Z M177 815H199V877H177Z" />
      )}
      {activity === "error" && (
        <path
          fill="#ad6833"
          d="M147 811H184V850H175V858H158V839H169V825H147Z M158 872H176V889H158Z"
        />
      )}
      {activity === "happy" && (
        <g className="cat-sparkles" fill="#f8d565" stroke="#916736" strokeWidth="5">
          <path d="M859 835v-23h14v23h23v14h-23v23h-14v-23h-23v-14Z M894 997v-16h12v16h16v12h-16v16h-12v-16h-16v-12Z" />
        </g>
      )}
    </g>
  );
}
