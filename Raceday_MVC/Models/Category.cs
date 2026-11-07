namespace Raceday_MVC.Models
{
    public class Category
    {
        public int CategoryId { get; set; }

        public string? Name { get; set; }

        public int? MinAge { get; set; }

        public int? MaxAge { get; set; }

        public decimal? DistanceKm { get; set; }
    }
}