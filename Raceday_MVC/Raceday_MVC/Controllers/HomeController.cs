using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Raceday_MVC.Models;
using Raceday_MVC.Services;

namespace Raceday_MVC.Controllers
{
    public class HomeController : Controller
    {
        private readonly ILogger<HomeController> _logger;
        private readonly RaceDayApi _api;

        public HomeController(ILogger<HomeController> logger, RaceDayApi api)
        {
            _logger = logger;
            _api = api;
        }

        public async Task<IActionResult> Index()
        {
            var allEvents = await _api.GetEventsAsync() ?? new List<Event>();

            var upcoming = allEvents
                .Where(e => e.EventDate.AddHours(6) > DateTime.Now)
                .OrderBy(e => e.EventDate)
                .ToList();

            var homeEvents = new List<Event>();
            homeEvents.AddRange(upcoming.Where(e => e.EventType == "Run").Take(1));
            homeEvents.AddRange(upcoming.Where(e => e.EventType == "Cycle").Take(1));
            homeEvents.AddRange(upcoming.Where(e => e.EventType == "Walk").Take(1));
            return View(homeEvents.OrderBy(e => e.EventDate).ToList());
        }

        public IActionResult About()
        {
            return View();
        }

        [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
        public IActionResult Error()
        {
            return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
        }
    }
}
