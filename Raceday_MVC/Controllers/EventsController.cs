using Microsoft.AspNetCore.Mvc;
using Raceday_MVC.Services;

namespace Raceday_MVC.Controllers
{
    public class EventsController : Controller
    {
        private readonly RaceDayApi _api;

        public EventsController(RaceDayApi api)
        {
            _api = api;
        }

        public async Task<IActionResult> Index(string? eventType, string? location, DateTime? dateFrom, DateTime? dateTo)
        {
            var events = await _api.GetEventsAsync();

            if (events != null)
            {
                if (!string.IsNullOrEmpty(eventType))
                    events = events.Where(e => e.EventType == eventType).ToList();

                if (!string.IsNullOrWhiteSpace(location))
                    events = events.Where(e => e.Location != null &&
                        e.Location.Contains(location.Trim(), StringComparison.OrdinalIgnoreCase)).ToList();

                if (dateFrom.HasValue)
                    events = events.Where(e => e.EventDate.Date >= dateFrom.Value.Date).ToList();

                if (dateTo.HasValue)
                    events = events.Where(e => e.EventDate.Date <= dateTo.Value.Date).ToList();
            }

            ViewBag.EventType = eventType;
            ViewBag.Location = location;
            ViewBag.DateFrom = dateFrom?.ToString("yyyy-MM-dd");
            ViewBag.DateTo = dateTo?.ToString("yyyy-MM-dd");

            return View(events);
        }

        public async Task<IActionResult> Details(int id)
        {
            var eventItem = await _api.GetEventAsync(id);

            if (eventItem == null)
            {
                return NotFound();
            }

            return View(eventItem);
        }
    }
}