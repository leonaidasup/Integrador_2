import React from "react";

interface SvgIconProps {
  name: string;
  size?: string;
  className?: string;
  style?: React.CSSProperties;
  glow?: string;
}

export const SvgIcon: React.FC<SvgIconProps> = ({
  name,
  size = "w-4 h-4",
  className = "",
  style,
  glow,
}) => {
  const [svg, setSvg] = React.useState("");
  const [isHovered, setIsHovered] = React.useState(false);

  React.useEffect(() => {
    fetch(`/icons/${name}.svg`)
      .then((res) => res.text())
      .then((text) => {
        const resized = text
          .replace(/width="[^"]*"/, 'width="100%"')
          .replace(/height="[^"]*"/, 'height="100%"');
        setSvg(resized);
      });
  }, [name]);

  return (
    <span
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        ...style,
        ...(glow && isHovered
          ? { filter: `drop-shadow(0 0 4px ${glow})` }
          : {}),
      }}
      className={`${size} ${className} inline-flex items-center justify-center`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};
