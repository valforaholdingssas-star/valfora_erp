import PropTypes from "prop-types";
import Chart from "react-apexcharts";

const RevenueChart = ({ rows }) => {
  const categories = (rows || []).map((r) => r.month);
  const values = (rows || []).map((r) => r.value || 0);
  return (
    <Chart
      type="bar"
      height={290}
      series={[{ name: "Ingresos", data: values }]}
      options={{
        chart: { toolbar: { show: false } },
        xaxis: { categories },
        colors: ["#198754"],
      }}
    />
  );
};

RevenueChart.propTypes = {
  rows: PropTypes.arrayOf(PropTypes.object),
};

export default RevenueChart;
