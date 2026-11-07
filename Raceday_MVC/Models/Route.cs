namespace Raceday_MVC.Models
{
    public class Route
    {
        public int RouteId { get; set; }

        public string? RouteName { get; set; }

        public string? MapUrl { get; set; }

        public decimal? ElevationGain { get; set; }

        public decimal StartLatitude { get; set; }

        public decimal StartLongitude { get; set; }

        public List<Waypoint>? Waypoints { get; set; }
    }
}