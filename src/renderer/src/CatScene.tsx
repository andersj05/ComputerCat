import catImage from "../../../assets/computer_cat.png";

export function CatScene({
  compact = false,
  animation = false,
}: {
  compact?: boolean;
  animation?: boolean;
}) {
  return (
    <div
      className={`cat-scene ${compact ? "compact" : ""} ${animation ? "animated" : ""}`}
      aria-hidden="true"
    >
      <span className="scene-cloud cloud-one" />
      <span className="scene-cloud cloud-two" />
      <span className="scene-hill hill-back" />
      <span className="scene-hill hill-front" />
      {!compact && (
        <span className="scene-bubble">
          hey, friend.<span>♥</span>
        </span>
      )}
      <img src={catImage} alt="" draggable="false" />
      {!compact && <span className="scene-caption">a happy place for your cat</span>}
    </div>
  );
}
