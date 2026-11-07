using System.Net.Http.Json;
using Raceday_MVC.Models;

namespace Raceday_MVC.Services
{
    public class RaceDayApi
    {
        private readonly HttpClient _httpClient;

        public RaceDayApi(HttpClient httpClient)
        {
            _httpClient = httpClient;
        }

        public async Task<List<Event>?> GetEventsAsync()
        {
            return await _httpClient.GetFromJsonAsync<List<Event>>("api/events");
        }

        public async Task<Event?> GetEventAsync(int id)
        {
            return await _httpClient.GetFromJsonAsync<Event>($"api/events/{id}");
        }
    }
}