const Select = ({ value, onChange, children, disabled }) => {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="input"
    >
      {children}
    </select>
  );
};

Select.defaultProps = {
  disabled: false
};

export default Select;