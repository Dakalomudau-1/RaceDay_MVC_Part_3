using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using RaceDay.Models;
using RaceDay.NewFolder;
using RaceDay.Services;

namespace RaceDay.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class EventsController : ControllerBase
    {
        private readonly RaceDayContext _context;
        private readonly IBlobService _blob;

        public EventsController(RaceDayContext context, IBlobService blob)
        {
            _context = context;
            _blob = blob;
        }

        [HttpGet]
        public IActionResult GetEvents(
            [FromQuery] string eventType = null,
            [FromQuery] DateTime? dateFrom = null,
            [FromQuery] DateTime? dateTo = null,
            [FromQuery] string location = null)
        {
            var query = _context.Events.AsQueryable();

            if (!string.IsNullOrEmpty(eventType))
                query = query.Where(e => e.EventType == eventType);
            if (dateFrom.HasValue)
                query = query.Where(e => e.EventDate >= dateFrom.Value);
            if (dateTo.HasValue)
                query = query.Where(e => e.EventDate <= dateTo.Value);
            if (!string.IsNullOrEmpty(location))
                query = query.Where(e => e.Location.Contains(location));

            var results = query
    .ToList()
    .Select(e => new
    {
        e.EventId,
        e.OrganiserId,
        e.Name,
        e.Description,
        e.EventDate,
        e.Location,
        e.DistanceKm,
        e.EventType,
        e.BannerImageUrl,

        OrganiserName = _context.Organisers
            .Where(o => o.OrganiserId == e.OrganiserId)
            .Select(o => o.FullName)
            .FirstOrDefault()
    })
    .ToList();

            return Ok(results);
        }

        [HttpGet("{id}")]
        public IActionResult GetEvent(int id)
        {
            var eventItem = _context.Events.FirstOrDefault(e => e.EventId == id);
            if (eventItem == null)
                return NotFound(new { message = "Event not found" });

            return Ok(new
            {
                eventItem.EventId,
                eventItem.Name,
                eventItem.Description,
                eventItem.EventDate,
                eventItem.Location,
                eventItem.DistanceKm,
                eventItem.EventType,
                eventItem.BannerImageUrl,
                eventItem.CreatedAt,
                Organiser = _context.Organisers
                .Where(o => o.OrganiserId == eventItem.OrganiserId)
                .Select(o => new { o.OrganiserId, o.FullName })
                .FirstOrDefault(),
                Categories = _context.Categories
                .Where(c => c.EventId == eventItem.EventId)
                .Select(c => new { c.CategoryId, c.Name, c.MinAge, c.MaxAge, c.DistanceKm })
                .ToList(),
                Route = _context.Routes
                .Where(r => r.EventId == eventItem.EventId)
                .Select(r => new
                {
                    r.RouteId,
                    r.RouteName,
                    r.StartLatitude,
                    r.StartLongitude,
                    r.ElevationGain,
                    r.MapUrl,
                Waypoints = _context.Waypoints
                .Where(w => w.RouteId == r.RouteId)
                .OrderBy(w => w.SequenceNo)
                .Select(w => new
                {
                    w.SequenceNo,
                    w.Latitude,
                    w.Longitude
                })
                .ToList()
                })
                .FirstOrDefault()
            });
        }

        [HttpPost]
        public IActionResult CreateEvent([FromBody] CreateEventRequest request)
        {
            var userId = HttpContext.Session.GetInt32("UserId");
            if (!userId.HasValue)
                return Unauthorized(new { message = "You must be logged in" });

            var user = _context.Users.FirstOrDefault(u => u.UserId == userId.Value);
            if (user == null || user.Role != "Organiser")
                return StatusCode(403, new { message = "Only organisers can create events" });

            var organiser = _context.Organisers.FirstOrDefault(o => o.UserId == userId.Value);
            if (organiser == null)
                return StatusCode(403, new { message = "Organiser profile not found" });

            var validTypes = new[] { "Run", "Walk", "Cycle" };
            if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Location) || !validTypes.Contains(request.EventType))
                return BadRequest(new { message = "Name and location are required, and eventType must be 'Run', 'Walk' or 'Cycle'" });

            var newEvent = new Event
            {
                OrganiserId = organiser.OrganiserId,
                Name = request.Name,
                Description = request.Description,
                EventDate = request.EventDate,
                Location = request.Location,
                DistanceKm = request.DistanceKm,
                EventType = request.EventType,
                BannerImageUrl = request.BannerImageUrl,
                CreatedAt = DateTime.Now
            };

            _context.Events.Add(newEvent);
            _context.SaveChanges();

            return Created(string.Empty, new
            {
                eventId = newEvent.EventId,
                newEvent.Name,
                newEvent.Description,
                newEvent.EventDate,
                newEvent.Location,
                newEvent.DistanceKm,
                newEvent.EventType,
                newEvent.CreatedAt
            });
        }

        [HttpPut("{id}")]
        public IActionResult UpdateEvent(int id, [FromBody] UpdateEventRequest request)
        {
            var userId = HttpContext.Session.GetInt32("UserId");
            if (!userId.HasValue)
                return Unauthorized(new { message = "You must be logged in" });

            var eventItem = _context.Events.FirstOrDefault(e => e.EventId == id);
            if (eventItem == null)
                return NotFound(new { message = "Event not found" });

            var organiser = _context.Organisers.FirstOrDefault(o => o.OrganiserId == eventItem.OrganiserId);
            if (organiser == null || organiser.UserId != userId.Value)
                return StatusCode(403, new { message = "Only the organiser who owns this event can update it" });

            if (!string.IsNullOrEmpty(request.EventType) && !new[] { "Run", "Walk", "Cycle" }.Contains(request.EventType))
                return BadRequest(new { message = "eventType must be 'Run', 'Walk' or 'Cycle'" });

            if (!string.IsNullOrEmpty(request.Name))
                eventItem.Name = request.Name;
            if (!string.IsNullOrEmpty(request.Description))
                eventItem.Description = request.Description;
            if (request.EventDate.HasValue)
                eventItem.EventDate = request.EventDate.Value;
            if (!string.IsNullOrEmpty(request.Location))
                eventItem.Location = request.Location;
            if (request.DistanceKm.HasValue)
                eventItem.DistanceKm = request.DistanceKm.Value;
            if (!string.IsNullOrEmpty(request.EventType))
                eventItem.EventType = request.EventType;
            if (!string.IsNullOrEmpty(request.BannerImageUrl))
                eventItem.BannerImageUrl = request.BannerImageUrl;

            _context.SaveChanges();

            return Ok(eventItem);
        }

        [HttpPost("{id}/banner")]
        public async Task<IActionResult> UploadBanner(int id, IFormFile file)
        {
            var userId = HttpContext.Session.GetInt32("UserId");
            if (!userId.HasValue)
                return Unauthorized(new { message = "You must be logged in" });

            var eventItem = _context.Events.FirstOrDefault(e => e.EventId == id);
            if (eventItem == null)
                return NotFound(new { message = "Event not found" });

            var organiser = _context.Organisers.FirstOrDefault(o => o.OrganiserId == eventItem.OrganiserId);
            if (organiser == null || organiser.UserId != userId.Value)
                return StatusCode(403, new { message = "Only the organiser who owns this event can change its banner" });

            if (file == null || file.Length == 0)
                return BadRequest(new { message = "Choose an image to upload" });

            string url;
            try
            {
                url = await _blob.UploadImageAsync(file, "banners");
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (InvalidOperationException ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }

            eventItem.BannerImageUrl = url;
            _context.SaveChanges();
            return Ok(new { bannerImageUrl = url });
        }

        [HttpDelete("{id}")]
        public IActionResult DeleteEvent(int id)
        {
            var userId = HttpContext.Session.GetInt32("UserId");
            if (!userId.HasValue)
                return Unauthorized(new { message = "You must be logged in" });

            var eventItem = _context.Events.FirstOrDefault(e => e.EventId == id);
            if (eventItem == null)
                return NotFound(new { message = "Event not found" });

            var organiser = _context.Organisers .FirstOrDefault(o => o.OrganiserId == eventItem.OrganiserId);
            if (organiser == null || organiser.UserId != userId.Value)
                return StatusCode(403, new { message = "Only the organiser who owns this event can delete it" });

            _context.Events.Remove(eventItem);
            _context.SaveChanges();

            return NoContent();
        }

        public class CreateEventRequest
        {
            public string Name { get; set; }
            public string Description { get; set; }
            public DateTime EventDate { get; set; }
            public string Location { get; set; }
            public decimal DistanceKm { get; set; }
            public string EventType { get; set; }
            public string BannerImageUrl { get; set; }
        }

        public class UpdateEventRequest
        {
            public string Name { get; set; }
            public string Description { get; set; }
            public DateTime? EventDate { get; set; }
            public string Location { get; set; }
            public decimal? DistanceKm { get; set; }
            public string EventType { get; set; }

            public string BannerImageUrl { get; set; }
        }
    }
}
