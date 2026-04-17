import { SvgIcon } from "../SvgIcon";

interface Props {
  icon?: string;
  label: string;
  value: number | string;
  classNameValue: string;
}

export function SummaryCard({
  icon,
  label,
  value,
  classNameValue = "",
}: Props) {
  return (
    <div className="flex flex-col gap-2 w-fit">
      <div className="flex flex-row items-center justify-center gap-2">
        {icon && (
          <SvgIcon name={icon} className="text-[var(--cl-font-secondary)]" />
        )}
        <span className="text-[var(--cl-font-secondary)]">{label}</span>
      </div>
      <h1
        className={`text-2xl font-bold 
        ${classNameValue}`}
      >
        {value}
      </h1>
    </div>
  );
}
