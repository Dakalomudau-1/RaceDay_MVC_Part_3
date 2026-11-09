using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using RaceDay.Models;
using RaceDay.NewFolder;

namespace RaceDay.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class ParticipantsController : ControllerBase
    {
        private readonly RaceDayContext _context;

        public ParticipantsController(RaceDayContext context)
        {
            _context = context;
        }

        [HttpGet]
        public IActionResult GetParticipants()
        {
            var userId = HttpContext.Session.GetInt32("UserId");
            if (!userId.HasValue)
                return Unauthorized(new { message = "You must be logged in" });

            var user = _context.Users.FirstOrDefault(u => u.UserId == userId.Value);
            if (user == null || user.Role != "Organiser")
                return StatusCode(403, new { message = "Only organisers can view all participants" });

            return Ok(_context.Participants
                .Select(p => new { p.ParticipantId, p.FullName, p.PhoneNumber })
                .ToList());
        }

        [HttpGet("{id}")]
        public IActionResult GetParticipant(int id)
        {
            var participant = _context.Participants.FirstOrDefault(p => p.ParticipantId == id);
            if (participant == null)
                return NotFound(new { message = "Participant not found" });

            var userId = HttpContext.Session.GetInt32("UserId");
            if (!userId.HasValue)
                return Unauthorized(new { message = "You must be logged in" });

            var user = _context.Users.FirstOrDefault(u => u.UserId == userId.Value);
            if (user == null || (user.Role != "Organiser" && participant.UserId != userId.Value))
                return StatusCode(403, new { message = "You can only view your own profile" });

            return Ok(new
            {
                participant.ParticipantId,
                participant.FullName,
                participant.DateOfBirth,
                participant.PhoneNumber,
                participant.ProfilePictureUrl
            });
        }
    }
}
