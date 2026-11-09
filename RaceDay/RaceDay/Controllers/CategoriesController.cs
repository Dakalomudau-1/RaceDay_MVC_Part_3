using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Mvc;
using RaceDay.Models;
using RaceDay.NewFolder;

namespace RaceDay.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class CategoriesController : ControllerBase
    {
        private readonly RaceDayContext _context;

        public CategoriesController(RaceDayContext context)
        {
            _context = context;
        }

        [HttpGet]
        public IActionResult GetAllCategories()
        {
            return Ok(_context.Categories
                .Select(c => new
                {
                    c.CategoryId,
                    c.EventId,
                    c.Name,
                    c.MinAge,
                    c.MaxAge,
                    c.DistanceKm,
                    Event = _context.Events
                    .Where(e => e.EventId == c.EventId)
                    .Select(e => new { e.EventId, e.Name })
                    .FirstOrDefault()
                })
            .ToList());
        }


        [HttpGet("{id}")]
        public IActionResult GetCategory(int id)
        {
            var category = _context.Categories.FirstOrDefault(c => c.CategoryId == id);
            if (category == null)
                return NotFound(new { message = "Category not found" });

            return Ok(new
            {
                category.CategoryId,
                category.EventId,
                Event = _context.Events.FirstOrDefault(e => e.EventId == category.EventId)?.Name,
                category.Name,
                category.MinAge,
                category.MaxAge,
                category.DistanceKm
            });
        }

        [HttpGet("~/api/events/{eventId}/categories")]
        public IActionResult GetCategoriesByEvent(int eventId)
        {
            var eventItem = _context.Events.FirstOrDefault(e => e.EventId == eventId);
            if (eventItem == null)
                return NotFound(new { message = "Event not found" });

            var categories = _context.Categories
                .Where(c => c.EventId == eventId)
                .Select(c => new
                {
                    c.CategoryId,            
                    c.Name,
                    c.MinAge,
                    c.MaxAge,
                    c.DistanceKm
                })
                .ToList();

            return Ok(categories);
        }

        [HttpPost("~/api/events/{eventId}/categories")]
        public IActionResult CreateCategory(int eventId, [FromBody] CreateCategoryRequest request)
        {
            var userId = HttpContext.Session.GetInt32("UserId");
            if (!userId.HasValue)
                return Unauthorized(new { message = "You must be logged in" });

            var user = _context.Users.FirstOrDefault(u => u.UserId == userId.Value);
            if (user == null || user.Role != "Organiser")
                return StatusCode(403, new { message = "Only organisers can create categories" });

            var eventItem = _context.Events.FirstOrDefault(e => e.EventId == eventId);
            if (eventItem == null)
                return NotFound(new { message = "Event not found" });

            var organiser = _context.Organisers.FirstOrDefault(o => o.OrganiserId == eventItem.OrganiserId);
            if (organiser == null || organiser.UserId != userId.Value)
                return StatusCode(403, new { message = "Only the organiser who owns this event can add categories" });

            var category = new Category
            {
                EventId = eventId,
                Name = request.Name,
                MinAge = request.MinAge,
                MaxAge = request.MaxAge,
                DistanceKm = request.DistanceKm
            };

            _context.Categories.Add(category);
            _context.SaveChanges();

            return Created(string.Empty, new
            {
                category.CategoryId,
                category.Name,
                category.MinAge,
                category.MaxAge,
                category.DistanceKm
            });
        }

        [HttpPut("{id}")]
        public IActionResult UpdateCategory(int id, [FromBody] UpdateCategoryRequest request)
        {
            var userId = HttpContext.Session.GetInt32("UserId");
            if (!userId.HasValue)
                return Unauthorized(new { message = "You must be logged in" });

            var category = _context.Categories.FirstOrDefault(c => c.CategoryId == id);
            if (category == null)
                return NotFound(new { message = "Category not found" });

            var eventItem = _context.Events.FirstOrDefault(e => e.EventId == category.EventId);
            if (eventItem == null)
                return NotFound(new { message = "Associated event not found" });

            var organiser = _context.Organisers.FirstOrDefault(o => o.OrganiserId == eventItem.OrganiserId);
            if (organiser == null || organiser.UserId != userId.Value)
                return StatusCode(403, new { message = "Only the organiser who owns this event can update categories" });

            if (!string.IsNullOrEmpty(request.Name))
                category.Name = request.Name;
            if (request.MinAge.HasValue)
                category.MinAge = request.MinAge;
            if (request.MaxAge.HasValue)
                category.MaxAge = request.MaxAge;
            if (request.DistanceKm.HasValue)
                category.DistanceKm = request.DistanceKm.Value;
            
            _context.SaveChanges();

            return Ok(category);
        }

        [HttpDelete("{id}")]
        public IActionResult DeleteCategory(int id)
        {
            var userId = HttpContext.Session.GetInt32("UserId");
            if (!userId.HasValue)
                return Unauthorized(new { message = "You must be logged in" });

            var category = _context.Categories.FirstOrDefault(c => c.CategoryId == id);
            if (category == null)
                return NotFound(new { message = "Category not found" });

            var eventItem = _context.Events.FirstOrDefault(e => e.EventId == category.EventId);
            if (eventItem == null)
                return NotFound(new { message = "Associated event not found" });

            var organiser = _context.Organisers.FirstOrDefault(o => o.OrganiserId == eventItem.OrganiserId);
            if (organiser == null || organiser.UserId != userId.Value)
                return StatusCode(403, new { message = "Only the organiser who owns this event can delete categories" });

            if (_context.Enrolments.Any(en => en.CategoryId == id))
                return Conflict(new { message = "This category has enrolments, so it cannot be deleted" });

            _context.Categories.Remove(category);

            _context.SaveChanges();
            return NoContent();
        }

        public class CreateCategoryRequest
        {
            public string Name { get; set; }
            public int? MinAge { get; set; }
            public int? MaxAge { get; set; }
            public decimal DistanceKm { get; set; }
        }

        public class UpdateCategoryRequest
        {
            public string Name { get; set; }
            public int? MinAge { get; set; }
            public int? MaxAge { get; set; }
            public decimal? DistanceKm { get; set; }
        }
    }
}
