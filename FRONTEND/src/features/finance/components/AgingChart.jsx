import PropTypes from "prop-types";
import Chart from "react-apexcharts";

const AgingChart = ({ aging }) => {
  const labels = ["Corriente", "1-30", "31-60", "61-90", "90+"];
  const series = [
    aging?.current?.total || 0,
    aging?.days_1_30?.total || 0,
    aging?.days_31_60?.total || 0,
    aging?.days_61_90?.total || 0,
    aging?.days_90_plus?.total || 0,
  ];
  return (
    <Chart
      type="donut"
      height={290}
      series={series}
      options={{
        labels,
        legend: { position: "bottom" },
        colors: ["#0d6efd", "#fd7e14", "#ffc107", "#dc3545", "#6c757d"],
      }}
    />
  );
};

AgingChart.propTypes = {
  aging: PropTypes.object,
};

export default AgingChart;
