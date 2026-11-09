using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RaceDay.NewFolder;

namespace RaceDay.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class WeatherForecastController : ControllerBase
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;
        private readonly RaceDayContext _context;

        public WeatherForecastController( IHttpClientFactory httpClientFactory,IConfiguration configuration,RaceDayContext context)
        {
            _httpClient = httpClientFactory.CreateClient("OpenWeatherMap");
            _configuration = configuration;
            _context = context;
        }

        [HttpGet("events/{id}")]
        public async Task<IActionResult> GetEventWeather(int id)
        {
            var eventItem = _context.Events.FirstOrDefault(e => e.EventId == id);
            if (eventItem == null)
                return NotFound(new { message = "Event not found" });

            // Manually find the route for this event
            var route = _context.Routes.FirstOrDefault(r => r.EventId == id);
            if (route == null)
                return NotFound(new { message = "Route not found" });

            var apiKey = _configuration["OpenWeatherMap:ApiKey"];
            var url = $"data/2.5/weather?lat={route.StartLatitude}&lon={route.StartLongitude}&appid={apiKey}&units=metric";

            var response = await _httpClient.GetAsync(url);

            if (!response.IsSuccessStatusCode)
                return StatusCode(502, new { message = "OpenWeather service unavailable or API key invalid" });

            var json = await response.Content.ReadAsStringAsync();
            var forecast = System.Text.Json.JsonSerializer.Deserialize<OpenWeatherResponse>(json);

            return Ok(forecast);
        }
    }
}
