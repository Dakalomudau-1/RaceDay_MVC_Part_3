using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using RaceDay.Models;
using RaceDay.NewFolder;
using RaceDay.Services;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Hosting;

namespace RaceDay.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class UsersController : ControllerBase
    {
        private readonly RaceDayContext _context;
        private readonly IMemoryCache _cache;
        private readonly ISmsSender _sms;
        private readonly IWebHostEnvironment _env;
        private readonly IBlobService _blob;

        public UsersController(RaceDayContext context, IMemoryCache cache, ISmsSender sms, IWebHostEnvironment env, IBlobService blob)
        {
            _context = context;
            _cache = cache;
            _sms = sms;
            _env = env;
            _blob = blob;
        }

        [HttpPost("~/api/auth/register")]
        public IActionResult Register([FromBody] RegisterRequest request)
        {
            // Check if email exists
            if (_context.Users.Any(u => u.Email == request.Email))
                return Conflict(new { message = "Account already exists with this email" });

            // Validate required fields
            if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
                return BadRequest(new { message = "Email and password are required" });


            // Validate role
            if (request.Role != "Organiser" && request.Role != "Participant")
                return BadRequest(new { message = "Role must be 'Organiser' or 'Participant'" });

            // Validate email format based on role
            if (request.Role == "Organiser" && !request.Email.Contains("@organiser", StringComparison.OrdinalIgnoreCase))
                return BadRequest(new { message = "Organiser emails must contain '@organiser'" });

            // Validate email format based on role
            if (request.Role == "Participant" && !request.Email.Contains("@participant", StringComparison.OrdinalIgnoreCase))
                return BadRequest(new { message = "Participant emails must contain '@participant'" });

            // Validate DateOfBirth for Participants
            if (request.Role == "Participant" && !request.DateOfBirth.HasValue)
                return BadRequest(new { message = "Date of birth is required for participants" });

            // Hash password
            using var sha256 = SHA256.Create();
            var hashedBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(request.Password));
            var passwordHash = Convert.ToBase64String(hashedBytes);

            // Create User
            var user = new User
            {
                Email = request.Email,
                PasswordHash = passwordHash,
                Role = request.Role,
                CreatedAt = DateTime.Now
            };
            _context.Users.Add(user);
            _context.SaveChanges();

            // Create role-specific profile
            if (request.Role == "Organiser")
            {
                var organiser = new Organiser
                {
                    UserId = user.UserId,
                    FullName = request.FullName,
                    PhoneNumber = request.PhoneNumber,
                    User = user
                };
                _context.Organisers.Add(organiser);
                _context.SaveChanges();
            }
            else // Participant
            {
                var participant = new Participant
                {
                    UserId = user.UserId,
                    FullName = request.FullName,
                    DateOfBirth = request.DateOfBirth.Value,
                    PhoneNumber = request.PhoneNumber,
                    User = user
                };
                _context.Participants.Add(participant);
                _context.SaveChanges();
            }

            return Created(string.Empty, new
            {
                userId = user.UserId,
                email = user.Email,
                role = user.Role,
                createdAt = user.CreatedAt
            });
        }

        [HttpPost("~/api/auth/login")]
        public IActionResult Login([FromBody] LoginRequest request)
        {
            var user = _context.Users.FirstOrDefault(u => u.Email == request.Email);
            if (user == null)
                return Unauthorized(new { message = "Invalid email or password" });

            using var sha256 = SHA256.Create();
            var hashedBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(request.Password));
            var passwordHash = Convert.ToBase64String(hashedBytes);

            if (user.PasswordHash != passwordHash)
                return Unauthorized(new { message = "Invalid email or password" });

            HttpContext.Session.SetInt32("UserId", user.UserId);
            HttpContext.Session.SetString("UserRole", user.Role);

            return Ok(new
            {
                message = "Login successful",
                userId = user.UserId,
                role = user.Role
            });
        }

        [HttpPost("~/api/auth/logout")]
        public IActionResult Logout()
        {
            HttpContext.Session.Clear();
            return Ok(new { message = "Logout successful" });
        }

        [HttpPost("~/api/auth/forgot-password")]
        public IActionResult ForgotPassword([FromBody] ForgotPasswordRequest request)
        {
            var phone = NormalisePhone(request?.PhoneNumber);
            if (phone == null)
                return BadRequest(new { message = "Enter a valid phone number" });

            var generic = new { message = "If that number is registered, a code has been sent." };

            var userId = FindUserIdByPhone(phone);
            if (userId == null)
                return Ok(generic);

            var code = RandomNumberGenerator.GetInt32(100000, 1000000).ToString();
            _cache.Set("reset:" + phone,
                new ResetEntry { UserId = userId.Value, Code = code },
                TimeSpan.FromMinutes(10));

            _sms.Send(request.PhoneNumber, $"Your RaceDay code is {code} (valid 10 minutes)");

            if (_env.IsDevelopment())
                return Ok(new { message = generic.message, demoCode = code });

            return Ok(generic);
        }

        [HttpPost("~/api/auth/reset-password")]
        public IActionResult ResetPassword([FromBody] ResetPasswordRequest request)
        {
            var phone = NormalisePhone(request?.PhoneNumber);
            if (phone == null || string.IsNullOrWhiteSpace(request.Code) || string.IsNullOrWhiteSpace(request.NewPassword))
                return BadRequest(new { message = "Phone number, code and new password are required" });

            if (request.NewPassword.Length < 6)
                return BadRequest(new { message = "Password must be at least 6 characters" });

            if (!_cache.TryGetValue("reset:" + phone, out ResetEntry entry))
                return BadRequest(new { message = "Invalid or expired code" });

            entry.Attempts++;
            if (entry.Attempts > 5)
            {
                _cache.Remove("reset:" + phone);
                return BadRequest(new { message = "Too many attempts. Request a new code." });
            }

            if (entry.Code != request.Code.Trim())
                return BadRequest(new { message = "Invalid or expired code" });

            var user = _context.Users.FirstOrDefault(u => u.UserId == entry.UserId);
            if (user == null)
                return BadRequest(new { message = "Invalid or expired code" });

            using var sha256 = SHA256.Create();
            var hashedBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(request.NewPassword));
            user.PasswordHash = Convert.ToBase64String(hashedBytes);
            _context.SaveChanges();

            _cache.Remove("reset:" + phone);
            return Ok(new { message = "Password updated. You can now log in." });
        }

        private static string NormalisePhone(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return null;
            var digits = new string(raw.Where(char.IsDigit).ToArray());
            if (digits.Length < 9) return null;
            return digits.Substring(digits.Length - 9);
        }

        private int? FindUserIdByPhone(string phone)
        {
            var participant = _context.Participants
                .Where(p => p.PhoneNumber != null)
                .Select(p => new { p.UserId, p.PhoneNumber })
                .ToList()
                .FirstOrDefault(p => NormalisePhone(p.PhoneNumber) == phone);
            if (participant != null) return participant.UserId;

            var organiser = _context.Organisers
                .Where(o => o.PhoneNumber != null)
                .Select(o => new { o.UserId, o.PhoneNumber })
                .ToList()
                .FirstOrDefault(o => NormalisePhone(o.PhoneNumber) == phone);
            return organiser?.UserId;
        }

        private class ResetEntry
        {
            public int UserId { get; set; }
            public string Code { get; set; }
            public int Attempts { get; set; }
        }

        [HttpGet("me")]
        public IActionResult GetProfile()
        {
            var userId = HttpContext.Session.GetInt32("UserId");
            if (!userId.HasValue)
                return Unauthorized(new { message = "No active session" });

            var user = _context.Users.FirstOrDefault(u => u.UserId == userId.Value);
            if (user == null)
                return NotFound(new { message = "User not found" });

            if (user.Role == "Organiser")
            {
                var organiser = _context.Organisers.FirstOrDefault(o => o.UserId == userId.Value);
                return Ok(new
                {
                    userId = user.UserId,
                    organiserId = organiser?.OrganiserId,
                    email = user.Email,
                    role = user.Role,
                    fullName = organiser?.FullName,
                    phoneNumber = organiser?.PhoneNumber,
                    profilePictureUrl = organiser?.ProfilePictureUrl,
                    createdAt = user.CreatedAt
                });
            }
            else
            {
                var participant = _context.Participants.FirstOrDefault(p => p.UserId == userId.Value);
                return Ok(new
                {
                    userId = user.UserId,
                    email = user.Email,
                    role = user.Role,
                    fullName = participant?.FullName,
                    dateOfBirth = participant?.DateOfBirth,
                    phoneNumber = participant?.PhoneNumber,
                    profilePictureUrl = participant?.ProfilePictureUrl,
                    createdAt = user.CreatedAt
                });
            }
        }

        [HttpPut("me")]
        public IActionResult UpdateProfile([FromBody] UpdateProfileRequest request)
        {
            var userId = HttpContext.Session.GetInt32("UserId");
            if (!userId.HasValue)
                return Unauthorized(new { message = "No active session" });

            var user = _context.Users.FirstOrDefault(u => u.UserId == userId.Value);
            if (user == null)
                return NotFound(new { message = "User not found" });

            if (user.Role == "Organiser")
            {
                var organiser = _context.Organisers.FirstOrDefault(o => o.UserId == userId.Value);
                if (organiser != null)
                {
                    if (!string.IsNullOrEmpty(request.FullName))
                        organiser.FullName = request.FullName;
                    if (!string.IsNullOrEmpty(request.PhoneNumber))
                        organiser.PhoneNumber = request.PhoneNumber;
                    if (!string.IsNullOrEmpty(request.ProfilePictureUrl))
                        organiser.ProfilePictureUrl = request.ProfilePictureUrl;
                }
            }
            else // Participant
            {
                var participant = _context.Participants.FirstOrDefault(p => p.UserId == userId.Value);
                if (participant != null)
                {
                    if (!string.IsNullOrEmpty(request.FullName))
                        participant.FullName = request.FullName;
                    if (request.DateOfBirth.HasValue)
                        participant.DateOfBirth = request.DateOfBirth.Value;
                    if (!string.IsNullOrEmpty(request.PhoneNumber))
                        participant.PhoneNumber = request.PhoneNumber;
                    if (!string.IsNullOrEmpty(request.ProfilePictureUrl))
                        participant.ProfilePictureUrl = request.ProfilePictureUrl;
                }
            }

            _context.SaveChanges();
            return Ok(new { message = "Profile updated successfully" });
            
        }

        [HttpPost("me/picture")]
        public async Task<IActionResult> UploadPicture(IFormFile file)
        {
            var userId = HttpContext.Session.GetInt32("UserId");
            if (!userId.HasValue)
                return Unauthorized(new { message = "No active session" });

            if (file == null || file.Length == 0)
                return BadRequest(new { message = "Choose an image to upload" });

            string url;
            try
            {
                url = await _blob.UploadImageAsync(file, "profiles");
            }
            catch (ArgumentException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (InvalidOperationException ex)
            {
                return StatusCode(500, new { message = ex.Message });
            }

            var organiser = _context.Organisers.FirstOrDefault(o => o.UserId == userId.Value);
            if (organiser != null)
            {
                organiser.ProfilePictureUrl = url;
            }
            else
            {
                var participant = _context.Participants.FirstOrDefault(p => p.UserId == userId.Value);
                if (participant == null)
                    return NotFound(new { message = "Profile not found" });
                participant.ProfilePictureUrl = url;
            }

            _context.SaveChanges();
            return Ok(new { profilePictureUrl = url });
        }

        public class RegisterRequest
        {
            public string FullName { get; set; }
            public string Email { get; set; }
            public string Password { get; set; }
            public string Role { get; set; }
            public DateTime? DateOfBirth { get; set; }
            public string PhoneNumber { get; set; }
        }

        public class LoginRequest
        {
            public string Email { get; set; }
            public string Password { get; set; }
        }

        public class UpdateProfileRequest
        {
            public string FullName { get; set; }
            public DateTime? DateOfBirth { get; set; }
            public string PhoneNumber { get; set; }
            public string ProfilePictureUrl { get; set; }
        }

        public class ForgotPasswordRequest
        {
            public string PhoneNumber { get; set; }
        }

        public class ResetPasswordRequest
        {
            public string PhoneNumber { get; set; }
            public string Code { get; set; }
            public string NewPassword { get; set; }
        }
    }
}
